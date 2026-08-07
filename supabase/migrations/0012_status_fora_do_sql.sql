-- Tira o status derivado da view.
--
-- Ele passou a ser calculado em src/lib/contasAPagar.ts (statusDaConta), que tem
-- teste. Manter a mesma derivacao ALEM disso no SQL criaria duas fontes para a
-- mesma resposta: no dia em que uma mudasse e a outra nao, ninguem perceberia -
-- e o sintoma seria uma conta "em aberto" numa tela e "atrasada" na outra.
--
-- A view continua entregando vencimento e paid_at, que e' o dado bruto de que o
-- status precisa. Quem consome decide.

-- DROP antes de criar: "create or replace view" nao remove nem reordena coluna,
-- e aqui `status` sai e `modo_do_plano` entra no meio. Nada mais depende desta
-- view alem de repo.ts, entao derrubar e' seguro.
drop view if exists public.v_contas_a_pagar;

create view public.v_contas_a_pagar as
select
  t.id,
  a.household_id,
  t.description                       as descricao,
  t.amount_cents,
  substr(t.date, 1, 7)                as competencia,
  coalesce(t.due_date, t.date)        as vencimento,
  t.paid_at,
  t.bill_id,
  t.installment_group_id,
  t.installment_number,
  t.installment_total,
  t.category_id,
  c.name                              as categoria,
  c.icon                              as categoria_icone,
  t.account_id,
  a.name                              as conta,
  a.entity_id,
  e.owner_id,
  u.name                              as dono,
  p.modo                              as modo_do_plano,
  case
    when t.bill_id is not null              then 'recorrente'
    when p.modo = 'fixed'                   then 'emprestimo'
    when t.installment_group_id is not null then 'parcela'
    else 'avulsa'
  end                                 as origem
from public.transactions t
join public.accounts a   on a.id = t.account_id
left join public.entities e   on e.id = a.entity_id
left join public.users u      on u.id = e.owner_id
left join public.categories c on c.id = t.category_id
left join public.installment_plans p on p.group_id = t.installment_group_id
where t.type = 'expense';
