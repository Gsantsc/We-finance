-- Fase 2 - consolidacao: views mensais, fechamento de mes, alerta de orcamento.
--
-- TRADUZIDO do rascunho original, que nao roda neste projeto:
--   * o rascunho agrupa por transactions.user_id - coluna que NAO existe aqui.
--     A posse flui transactions -> accounts -> entities.owner_id, e o
--     household_id mora em accounts. Todas as views abaixo seguem esse caminho.
--   * security_invoker = true nao protege nada: o app conecta como role postgres
--     (owner), que passa por cima de RLS. O isolamento e' o household_id nas
--     queries da aplicacao.
--   * transactions.date e' TEXT 'YYYY-MM-DD', entao date_trunc() nao se aplica.
--     O mes e' substr(date, 1, 7) -> 'YYYY-MM', que ordena e compara como texto.
--   * ids sao text, nao uuid.

-- 1) Base compartilhada -----------------------------------------------------
-- Resolve household/dono/mes UMA vez; as demais views agregam em cima desta,
-- para o join nao ser reescrito (e divergir) em cada uma.
-- owner_id NULL = dinheiro do casal.
create or replace view public.v_transaction_scope as
select
  t.id,
  t.account_id,
  t.category_id,
  t.type,
  t.amount_cents,
  t.date,
  substr(t.date, 1, 7)      as month,      -- 'YYYY-MM'
  t.source,
  -- bill_id entra no 0003, que recria esta view acrescentando a coluna no fim.
  t.installment_group_id,
  t.installment_number,
  t.installment_total,
  a.household_id,
  a.entity_id,
  a.type                    as account_type,
  e.owner_id
from public.transactions t
join public.accounts a  on a.id = t.account_id
left join public.entities e on e.id = a.entity_id;

-- 2) Resumo mensal por pessoa ----------------------------------------------
-- Uma linha por (casa, dono, mes). owner_id NULL = a linha do casal.
create or replace view public.v_monthly_summary as
select
  household_id,
  owner_id,
  month,
  coalesce(sum(amount_cents) filter (where type = 'income'),  0)::bigint as income_cents,
  coalesce(sum(amount_cents) filter (where type = 'expense'), 0)::bigint as expense_cents,
  (coalesce(sum(amount_cents) filter (where type = 'income'),  0)
   - coalesce(sum(amount_cents) filter (where type = 'expense'), 0))::bigint as net_cents
from public.v_transaction_scope
group by household_id, owner_id, month;

-- 3) Totais por categoria ---------------------------------------------------
create or replace view public.v_monthly_category_totals as
select
  s.household_id,
  s.owner_id,
  s.month,
  s.category_id,
  c.name  as category_name,
  c.icon  as category_icon,
  s.type,
  sum(s.amount_cents)::bigint as total_cents
from public.v_transaction_scope s
left join public.categories c on c.id = s.category_id
group by s.household_id, s.owner_id, s.month, s.category_id, c.name, c.icon, s.type;

-- 4) Fechamento de mes (opcional) -------------------------------------------
-- Congela os numeros de um mes ja encerrado, para o historico nao mudar quando
-- alguem edita um lancamento antigo.
create table if not exists public.monthly_closings (
  id            text primary key default gen_random_uuid()::text,
  household_id  text not null references public.households(id) on delete cascade,
  owner_id      text references public.users(id) on delete cascade,  -- NULL = casal
  month         text not null,          -- 'YYYY-MM'
  income_cents  bigint not null,
  expense_cents bigint not null,
  net_cents     bigint not null,
  locked        boolean not null default false,
  computed_at   timestamptz not null default now()
);

-- owner_id e' nullable, e NULL nao colide em unique - por isso o indice usa
-- coalesce, senao daria para fechar o mes do casal varias vezes.
create unique index if not exists idx_closings_unico
  on public.monthly_closings(household_id, coalesce(owner_id, ''), month);
create index if not exists idx_closings_household
  on public.monthly_closings(household_id, month desc);

-- 5) Alerta de orcamento ----------------------------------------------------
alter table public.budgets
  add column if not exists alert_threshold_pct smallint not null default 80,
  add column if not exists alert_enabled boolean not null default true;

alter table public.budgets drop constraint if exists budgets_alert_threshold_check;
alter table public.budgets add constraint budgets_alert_threshold_check
  check (alert_threshold_pct between 1 and 500);

-- Guarda o ultimo patamar avisado para o sino nao repetir o mesmo aviso todo
-- carregamento (avisou 80%, so volta a avisar em 100%).
create table if not exists public.budget_alert_state (
  id                text primary key default gen_random_uuid()::text,
  household_id      text not null references public.households(id) on delete cascade,
  budget_id         text not null references public.budgets(id) on delete cascade,
  month             text not null,        -- 'YYYY-MM'
  last_notified_pct smallint,
  notified_at       timestamptz,
  unique (budget_id, month)
);
create index if not exists idx_budget_alert_household
  on public.budget_alert_state(household_id);
