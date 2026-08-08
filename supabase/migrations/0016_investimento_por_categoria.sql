-- Investimento tambem passa a ser reconhecido por CATEGORIA, igual VA e VR.
--
-- Mesma historia do VA: a regra olhava so o tipo da conta, entao um aporte
-- lancado numa conta corrente com categoria "Investimentos" nao entrava na linha
-- Investimentos do painel. Exigir que a pessoa acerte o TIPO DA CONTA para o
-- numero aparecer e' transformar detalhe de modelagem em obrigacao dela.
--
-- Precedencia (a primeira que casar leva), preservando a exclusividade mutua:
--   VA > VR > Investimento > Salario
-- Sem a exclusao, um aporte com categoria "Investimentos" numa conta de
-- vale-refeicao entraria em duas fatias e inflaria o total que entrou.

create or replace view public.v_monthly_overview as
with marcado as (
  select
    s.*,
    (s.account_type = 'VALE_ALIMENTACAO'
      or public.sem_acento(c.name) like 'vale alimenta%')  as eh_va,
    (s.account_type = 'VALE_REFEICAO'
      or public.sem_acento(c.name) like 'vale refei%')     as eh_vr,
    (s.account_type = 'INVESTIMENTO'
      or public.sem_acento(c.name) like 'investimento%')   as eh_inv,
    (public.sem_acento(c.name) like 'salario%')            as eh_salario
  from public.v_transaction_scope s
  left join public.categories c on c.id = s.category_id
)
select
  m.household_id,
  case when grouping(m.owner_id) = 1 then null else m.owner_id end as owner_id,
  grouping(m.owner_id) = 1 as is_household_total,
  m.month,
  coalesce(sum(m.amount_cents) filter (
    where m.type = 'income' and m.eh_salario
      and not m.eh_va and not m.eh_vr and not m.eh_inv
  ), 0)::bigint as salary_cents,
  coalesce(sum(m.amount_cents) filter (
    where m.type = 'income' and m.eh_va
  ), 0)::bigint as va_cents,
  coalesce(sum(m.amount_cents) filter (
    where m.type = 'income' and m.eh_vr and not m.eh_va
  ), 0)::bigint as vr_cents,
  coalesce(sum(m.amount_cents) filter (
    where m.type = 'expense' and m.installment_group_id is not null
  ), 0)::bigint as installments_cents,
  coalesce(sum(m.amount_cents) filter (
    where m.type = 'income' and m.eh_inv and not m.eh_va and not m.eh_vr
  ), 0)::bigint as invested_cents,
  coalesce(sum(m.amount_cents) filter (where m.type = 'income'),  0)::bigint as income_cents,
  coalesce(sum(m.amount_cents) filter (where m.type = 'expense'), 0)::bigint as expense_cents,
  (coalesce(sum(m.amount_cents) filter (where m.type = 'income'),  0)
   - coalesce(sum(m.amount_cents) filter (where m.type = 'expense'), 0))::bigint as net_cents
from marcado m
group by grouping sets (
  (m.household_id, m.month, m.owner_id),
  (m.household_id, m.month)
);
