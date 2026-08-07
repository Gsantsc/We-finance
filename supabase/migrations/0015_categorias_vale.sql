-- VA e VR passam a ser reconhecidos por CATEGORIA tambem, nao so pelo tipo da
-- conta em que o dinheiro caiu.
--
-- O caso real: um deposito descrito "VA", de R$ 506, foi lancado numa conta
-- CORRENTE. Como a regra olhava so o tipo da conta, a linha VA do painel ficava
-- zerada e o valor caia em "Outras entradas". Para o numero aparecer, a pessoa
-- teria que adivinhar que o lancamento precisa ir para a conta do tipo certo -
-- exigir isso e' transformar detalhe de modelagem em obrigacao do usuario.
--
-- Agora vale qualquer um dos dois caminhos: a conta E' vale, ou a categoria diz
-- que aquilo e' vale.

insert into public.categories (id, name, icon, is_income)
select gen_random_uuid()::text, v.name, v.icon, true
from (values
  ('Vale alimentação', '🥗'),
  ('Vale refeição',    '🍽️')
) as v(name, icon)
where not exists (
  select 1 from public.categories c
  where public.sem_acento(c.name) = public.sem_acento(v.name)
);

-- As fatias continuam MUTUAMENTE EXCLUSIVAS. A precedencia agora e':
--   1. VA  - conta do tipo VA  OU categoria "Vale alimentação"
--   2. VR  - conta do tipo VR  OU categoria "Vale refeição"   (e nao for VA)
--   3. Investimento - conta do tipo Investimento              (e nao for VA/VR)
--   4. Salário      - categoria Salário                       (e nao for os acima)
-- Sem a exclusao explicita, um deposito com categoria "Vale refeição" numa conta
-- de vale-alimentacao entraria nas duas fatias e inflaria o total que entrou.
create or replace view public.v_monthly_overview as
with marcado as (
  select
    s.*,
    (s.account_type = 'VALE_ALIMENTACAO'
      or public.sem_acento(c.name) like 'vale alimenta%')                as eh_va,
    (s.account_type = 'VALE_REFEICAO'
      or public.sem_acento(c.name) like 'vale refei%')                   as eh_vr,
    (s.account_type = 'INVESTIMENTO')                                    as eh_inv,
    (public.sem_acento(c.name) like 'salario%')                          as eh_salario
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
