-- Corrige as flags da v_monthly_overview: NULL nao pode chegar no filter().
--
-- BUG: public.sem_acento e' STRICT, entao sem_acento(NULL) = NULL. Num
-- lancamento SEM CATEGORIA, a flag virava:
--
--   eh_va = (account_type = 'VALE_ALIMENTACAO')  OR  (NULL like 'vale alimenta%')
--         =  false                               OR   NULL
--         =  NULL          <- e nao false!
--
-- E a exclusao mutua usa `not eh_va`: `not NULL` = NULL. Como filter() so conta
-- a linha quando a condicao e' TRUE, e `<algo> AND NULL` nunca e' TRUE, a linha
-- era DESCARTADA da fatia.
--
-- Sintoma: um aporte de R$ 1.000 numa conta do tipo INVESTIMENTO, sem categoria,
-- entrava em income_cents mas nao em invested_cents - a linha Investimentos do
-- painel ficava zerada mesmo com o aporte lancado na conta certa. O mesmo valia
-- para Salario: qualquer entrada sem categoria sumia das fatias e so aparecia em
-- "Outras entradas".
--
-- CORRECAO: coalesce(..., false) em cada flag, para que "nao sei" vire "nao e'"
-- em vez de contaminar a expressao inteira.

create or replace view public.v_monthly_overview as
with marcado as (
  select
    s.*,
    coalesce(
      s.account_type = 'VALE_ALIMENTACAO'
        or public.sem_acento(c.name) like 'vale alimenta%', false)  as eh_va,
    coalesce(
      s.account_type = 'VALE_REFEICAO'
        or public.sem_acento(c.name) like 'vale refei%', false)     as eh_vr,
    coalesce(
      s.account_type = 'INVESTIMENTO'
        or public.sem_acento(c.name) like 'investimento%', false)   as eh_inv,
    coalesce(public.sem_acento(c.name) like 'salario%', false)      as eh_salario
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
