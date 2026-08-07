-- As fatias da entrada precisam ser MUTUAMENTE EXCLUSIVAS.
--
-- Cada filter() da view decidia sozinho, sem olhar os outros. Um deposito com
-- categoria "Salário" numa conta do tipo VALE_REFEICAO casava em DOIS filtros e
-- era contado duas vezes: em agosto, salario(13.426) + vr(450) = 13.876 contra
-- uma receita real de 13.426. O excesso de 450 inflava "Total que entrou" e a
-- Sobra na mesma medida.
--
-- ORDEM DE PRECEDENCIA (a primeira que casar leva):
--   1. tipo da CONTA (VA / VR / Investimento) - onde o dinheiro caiu e' o fato
--      mais concreto: dinheiro que entrou num vale-refeicao E' VR, ainda que
--      quem lancou tenha escolhido a categoria Salario.
--   2. categoria Salario
--   3. o resto vira "outras entradas", calculado por diferenca no app.
--
-- Assim as quatro fatias somam no maximo income_cents, e nunca mais que isso.

create or replace view public.v_monthly_overview as
select
  s.household_id,
  case when grouping(s.owner_id) = 1 then null else s.owner_id end as owner_id,
  grouping(s.owner_id) = 1 as is_household_total,
  s.month,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income'
      and s.account_type not in ('VALE_ALIMENTACAO', 'VALE_REFEICAO', 'INVESTIMENTO')
      and public.sem_acento(c.name) like 'salario%'
  ), 0)::bigint as salary_cents,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income' and s.account_type = 'VALE_ALIMENTACAO'
  ), 0)::bigint as va_cents,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income' and s.account_type = 'VALE_REFEICAO'
  ), 0)::bigint as vr_cents,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'expense' and s.installment_group_id is not null
  ), 0)::bigint as installments_cents,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income' and s.account_type = 'INVESTIMENTO'
  ), 0)::bigint as invested_cents,
  coalesce(sum(s.amount_cents) filter (where s.type = 'income'),  0)::bigint as income_cents,
  coalesce(sum(s.amount_cents) filter (where s.type = 'expense'), 0)::bigint as expense_cents,
  (coalesce(sum(s.amount_cents) filter (where s.type = 'income'),  0)
   - coalesce(sum(s.amount_cents) filter (where s.type = 'expense'), 0))::bigint as net_cents
from public.v_transaction_scope s
left join public.categories c on c.id = s.category_id
group by grouping sets (
  (s.household_id, s.month, s.owner_id),
  (s.household_id, s.month)
);
