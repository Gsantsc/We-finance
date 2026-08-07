-- Emprestimo e financiamento: categoria propria + o plano do parcelamento.
--
-- 1) CATEGORIAS. Emprestimo e financiamento nao sao "Outros": eles precisam ser
--    reconheciveis para o formulario escolher sozinho o modo PARCELA_FIXA (o
--    modo em que dividir o valor esta errado) e para o patrimonio saber o que e'
--    divida.
--
-- 2) installment_plans. Um parcelamento e' UM acordo com N lancamentos. Sem uma
--    linha para o acordo, dados como juros e credor teriam que ser repetidos nas
--    48 parcelas, e "quanto ainda devo" exigiria varrer todas elas.
--
--    Isto NAO e' uma entidade paralela ao lancamento: as parcelas continuam
--    sendo transactions comuns, e o plano so descreve o grupo que elas ja
--    formavam via installment_group_id. A tabela e' metadado do grupo.

insert into public.categories (id, name, icon, is_income)
select gen_random_uuid()::text, v.name, v.icon, false
from (values
  ('Empréstimo',    '🏦'),
  ('Financiamento', '🏠')
) as v(name, icon)
where not exists (
  select 1 from public.categories c
  where public.sem_acento(c.name) = public.sem_acento(v.name)
);

create table if not exists public.installment_plans (
  id                 text primary key default gen_random_uuid()::text,
  household_id       text not null references public.households(id) on delete cascade,
  -- 1:1 com o grupo de parcelas em transactions.installment_group_id.
  group_id           text not null unique,
  descricao          text not null,
  -- 'split'  = compra em Nx, o valor informado era o TOTAL
  -- 'fixed'  = parcela fixa (emprestimo), o valor informado era a PARCELA
  modo               text not null,
  installment_cents  bigint not null check (installment_cents > 0),
  total_cents        bigint not null check (total_cents > 0),
  installments_total smallint not null check (installments_total >= 1),
  first_month        text not null,          -- 'YYYY-MM' da 1a parcela
  last_month         text not null,          -- 'YYYY-MM' da ultima; evita recalcular
  -- Opcionais, so fazem sentido em emprestimo/financiamento.
  interest_rate_bps  integer,                -- 1,99% a.m. = 199
  creditor           text,
  category_id        text references public.categories(id) on delete set null,
  account_id         text references public.accounts(id) on delete cascade,
  created_by_id      text references public.users(id),
  created_at         timestamptz not null default now()
);

alter table public.installment_plans drop constraint if exists installment_plans_modo_check;
alter table public.installment_plans add constraint installment_plans_modo_check
  check (modo in ('split', 'fixed'));

alter table public.installment_plans drop constraint if exists installment_plans_juros_check;
alter table public.installment_plans add constraint installment_plans_juros_check
  check (interest_rate_bps is null or interest_rate_bps between 0 and 100000);

create index if not exists idx_installment_plans_household
  on public.installment_plans(household_id, last_month);

-- Quanto ainda se deve de cada parcelamento, na competencia de referencia.
--
-- Divida em aberto = parcela x parcelas que AINDA NAO venceram. Parcela ja
-- vencida saiu do passivo: ou foi paga, ou virou atraso - mas nao e' mais
-- "compromisso futuro". O valor original do emprestimo tambem nao serve: ele
-- ignora o que ja foi amortizado.
create or replace view public.v_installment_debt as
select
  p.household_id,
  p.group_id,
  p.descricao,
  p.creditor,
  p.installment_cents,
  p.installments_total,
  p.first_month,
  p.last_month,
  count(t.id) filter (
    where substr(t.date, 1, 7) > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  )::int as parcelas_restantes,
  (count(t.id) filter (
    where substr(t.date, 1, 7) > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ) * p.installment_cents)::bigint as saldo_devedor_cents
from public.installment_plans p
left join public.transactions t on t.installment_group_id = p.group_id
group by p.household_id, p.group_id, p.descricao, p.creditor,
         p.installment_cents, p.installments_total, p.first_month, p.last_month;
