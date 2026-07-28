-- Apoio ao dashboard mes a mes (T5-T9).
--
-- v_goal_progress (0003) responde "aporte deste mes" usando now(), o que serve
-- para o mes corrente mas nao para o seletor de mes. Esta view quebra os aportes
-- por mes para o dashboard filtrar o mes visivel.
create or replace view public.v_goal_monthly_contributions as
select
  goal_id,
  household_id,
  substr(date, 1, 7)          as month,
  sum(amount_cents)::bigint   as contributed_cents,
  count(*)::int               as contributions
from public.goal_contributions
group by goal_id, household_id, substr(date, 1, 7);

-- O dashboard filtra por mes o tempo todo (substr(date,1,7)). Sem indice de
-- expressao, cada troca de mes vira seq scan na tabela inteira.
create index if not exists idx_tx_month
  on public.transactions ((substr(date, 1, 7)));

create index if not exists idx_goal_contrib_month
  on public.goal_contributions ((substr(date, 1, 7)));

-- Contas a pagar sao consultadas sempre pela casa inteira.
create index if not exists idx_bills_household_due
  on public.bills(household_id, due_day);
