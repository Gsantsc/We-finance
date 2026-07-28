-- Fase 5 - PJ / Notas Fiscais. Modulo isolado do nucleo.
--
-- TRADUZIDO do rascunho: ids text, sem policies RLS (o app conecta como
-- postgres), e o dono nao e' user_id solto - e' a entidade PJ + a casa, do
-- mesmo jeito que accounts/bills/goals. Este banco ja tem a entidade
-- "GSF Tecnologia LTDA" com type = 'PJ'.
--
-- O calculo do Simples (anexo, faixa, RBT12) NAO vira coluna: e' camada de
-- servico. Aqui fica o dado de entrada (bruto) e o RESULTADO da apuracao.

-- 1) Perfil fiscal da entidade PJ -------------------------------------------
create table if not exists public.tax_profiles (
  id            text primary key default gen_random_uuid()::text,
  household_id  text not null references public.households(id) on delete cascade,
  entity_id     text not null references public.entities(id) on delete cascade,
  regime        text not null,
  simples_anexo smallint,          -- anexo I..V, quando aplicavel
  cnpj          text,
  created_at    timestamptz not null default now(),
  unique (entity_id)
);

alter table public.tax_profiles drop constraint if exists tax_profiles_regime_check;
alter table public.tax_profiles add constraint tax_profiles_regime_check
  check (regime in ('simples_nacional', 'mei', 'presumido'));

alter table public.tax_profiles drop constraint if exists tax_profiles_anexo_check;
alter table public.tax_profiles add constraint tax_profiles_anexo_check
  check (simples_anexo is null or simples_anexo between 1 and 5);

create index if not exists idx_tax_profiles_household on public.tax_profiles(household_id);

-- 2) Notas fiscais emitidas --------------------------------------------------
-- gross_cents e' o que o parser de NFS-e preenche. tax/net/rate ficam NULL ate
-- a apuracao rodar - por isso sao nullable, e nao "0".
create table if not exists public.invoices (
  id                 text primary key default gen_random_uuid()::text,
  household_id       text not null references public.households(id) on delete cascade,
  entity_id          text not null references public.entities(id) on delete cascade,
  number             text,
  issue_date         text not null,          -- 'YYYY-MM-DD', igual transactions.date
  counterparty       text,                   -- tomador do servico
  description        text,
  gross_cents        bigint not null check (gross_cents > 0),
  tax_cents          bigint,
  net_cents          bigint,
  effective_rate_bps integer,                -- aliquota efetiva, em bps
  transaction_id     text references public.transactions(id) on delete set null,
  created_by_id      text references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_invoices_entity_date
  on public.invoices(entity_id, issue_date desc);
create index if not exists idx_invoices_household_date
  on public.invoices(household_id, issue_date desc);
-- Mesmo numero nao entra duas vezes para a mesma PJ (reimport de XML).
create unique index if not exists idx_invoices_numero_unico
  on public.invoices(entity_id, number) where number is not null;

-- 3) Composicao do imposto por tributo ---------------------------------------
create table if not exists public.invoice_tax_breakdown (
  id           text primary key default gen_random_uuid()::text,
  invoice_id   text not null references public.invoices(id) on delete cascade,
  tax_name     text not null,          -- "ISS", "IRPJ", "CSLL"...
  amount_cents bigint not null
);

create index if not exists idx_invoice_tax_invoice
  on public.invoice_tax_breakdown(invoice_id);
create unique index if not exists idx_invoice_tax_unico
  on public.invoice_tax_breakdown(invoice_id, tax_name);

-- 4) RBT12 - receita bruta dos ultimos 12 meses ------------------------------
-- E' a entrada do calculo da aliquota efetiva do Simples. Fica como view para
-- a camada de servico nao reimplementar (e errar) a janela de 12 meses.
create or replace view public.v_invoice_rbt12 as
select
  i.entity_id,
  i.household_id,
  substr(i.issue_date, 1, 7) as month,
  sum(i.gross_cents)::bigint as gross_month_cents,
  sum(sum(i.gross_cents)) over (
    partition by i.entity_id
    order by substr(i.issue_date, 1, 7)
    rows between 11 preceding and current row
  )::bigint as rbt12_cents
from public.invoices i
group by i.entity_id, i.household_id, substr(i.issue_date, 1, 7);
