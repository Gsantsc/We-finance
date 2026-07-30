-- Fase 4 - casal (household).
--
-- TRADUZIDO do rascunho original. Diferencas relevantes:
--   * households e household_members JA EXISTEM neste banco (1 casa, 2 membros)
--     e ja sao a base do isolamento em todas as queries. Aqui so completamos
--     as colunas que faltavam.
--   * as policies com auth.uid()/is_household_member nao entram: o app conecta
--     como role postgres, que ignora RLS. Quem separa as casas e' o
--     household_id nas queries (ver assertAccountInHousehold em repo.ts).
--   * "de quem e' o dinheiro" NAO virou transactions.visibility. Ficou em
--     entities.owner_id (decisao tomada na Fase 3): owner preenchido = da
--     pessoa, NULL = do casal. Um segundo eixo de posse (private/shared em cada
--     lancamento) conviveria mal com esse e exigiria marcar linha a linha.

-- 1) Papel e participacao na renda ------------------------------------------
alter table public.household_members
  add column if not exists role text not null default 'member',
  add column if not exists income_share_bps integer;   -- 60% = 6000, p/ rateio futuro

alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members add constraint household_members_role_check
  check (role in ('owner', 'member'));

alter table public.household_members drop constraint if exists household_members_share_check;
alter table public.household_members add constraint household_members_share_check
  check (income_share_bps is null or income_share_bps between 0 and 10000);

-- O membro mais antigo de cada casa vira 'owner' (quem criou a casa).
update public.household_members m
   set role = 'owner'
 where m.role = 'member'
   and m.joined_at = (
     select min(m2.joined_at) from public.household_members m2
      where m2.household_id = m.household_id
   );

-- 2) Resumo mensal do casal --------------------------------------------------
-- Tudo da casa, sem separar por dono. A coluna "cada um" do dashboard sai de
-- v_monthly_summary (Fase 2), que ja quebra por owner_id.
create or replace view public.v_household_monthly_summary as
select
  household_id,
  month,
  coalesce(sum(amount_cents) filter (where type = 'income'),  0)::bigint as income_cents,
  coalesce(sum(amount_cents) filter (where type = 'expense'), 0)::bigint as expense_cents,
  (coalesce(sum(amount_cents) filter (where type = 'income'),  0)
   - coalesce(sum(amount_cents) filter (where type = 'expense'), 0))::bigint as net_cents
from public.v_transaction_scope
group by household_id, month;

-- 3) Os numeros objetivos do mes (T6) ---------------------------------------
-- Uma linha por (casa, dono, mes) e uma linha por (casa, NULL, mes) via
-- grouping sets, para a tela ler "cada pessoa" e "o casal" da mesma view sem
-- somar nada no cliente.
--
-- Dividas aqui = parcelas do mes (installment_group_id preenchido). As contas a
-- pagar recorrentes (bills) nao sao lancamentos e nao tem linha por mes, entao
-- continuam sendo resolvidas pela tela a partir de bills.due_day.
create or replace view public.v_monthly_overview as
select
  s.household_id,
  case when grouping(s.owner_id) = 1 then null else s.owner_id end as owner_id,
  grouping(s.owner_id) = 1 as is_household_total,
  s.month,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income' and c.name ilike 'salario%'
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
