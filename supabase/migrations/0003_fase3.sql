-- Fase 3 - contas VA/VR, ligacao lancamento <-> conta a pagar, aportes de meta.
--
-- Escrito contra o schema REAL deste projeto, que difere do rascunho original:
--   * auth e' NextAuth em public.users (nao auth.users); o app conecta como
--     role postgres, entao RLS nao e' aplicada e o isolamento e' por
--     household_id nas queries. Nao adianta escrever policy com auth.uid().
--   * ids sao text (uuid gerado no Node), nao uuid nativo.
--   * datas de competencia sao text 'YYYY-MM-DD', nao date.
--   * o "modulo casa" e' a tabela entities (CASA/PESSOAL/PJ) - ela fica.

-- 1) Dono da entidade -----------------------------------------------------
-- entities.owner_id ja existia mas estava NULL em todas as linhas, entao nao
-- havia como dizer o que e' de quem. Convencao: owner_id preenchido = dinheiro
-- daquela pessoa; NULL = do casal (entra na coluna compartilhada do dashboard).
create index if not exists idx_entities_owner on public.entities(owner_id);

-- Backfill conservador: so as entidades PESSOAL cujo nome cita o primeiro nome
-- de um usuario. O que ficar ambiguo (VR, Cartao de Credito) continua NULL =
-- casal, e o usuario ajusta na tela de entidades.
update public.entities e
   set owner_id = u.id
  from public.users u
 where e.owner_id is null
   and e.type = 'PESSOAL'
   and e.name ilike '%' || split_part(u.name, ' ', 1) || '%';

-- 2) Tipos de conta -------------------------------------------------------
-- accounts.type nunca teve CHECK no banco (so validacao zod). Passa a ter, ja
-- com os vales. INVESTIMENTO ja existia e e' o que o dashboard usa para somar
-- "Investimentos".
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check check (
  type in (
    'CORRENTE',
    'POUPANCA',
    'CARTAO',
    'INVESTIMENTO',
    'DINHEIRO',
    'VALE_ALIMENTACAO',  -- VA
    'VALE_REFEICAO',     -- VR
    'OUTRO'
  )
);

-- 3) Lancamento <-> conta a pagar -----------------------------------------
-- bills e' a INTENCAO (recorrente, dia de vencimento); transactions e' o FATO.
-- Pagar uma bill gera uma transaction apontando de volta, para o dashboard nao
-- contar a divida duas vezes.
alter table public.transactions
  add column if not exists bill_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_bill_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_bill_id_fkey
      foreign key (bill_id) references public.bills(id) on delete set null;
  end if;
end $$;

create index if not exists idx_tx_bill on public.transactions(bill_id)
  where bill_id is not null;

-- Agora que a coluna existe, v_transaction_scope (0002) passa a expor bill_id.
-- create or replace exige repetir as colunas na mesma ordem; a nova vai no fim.
create or replace view public.v_transaction_scope as
select
  t.id,
  t.account_id,
  t.category_id,
  t.type,
  t.amount_cents,
  t.date,
  substr(t.date, 1, 7)      as month,
  t.source,
  t.installment_group_id,
  t.installment_number,
  t.installment_total,
  a.household_id,
  a.entity_id,
  a.type                    as account_type,
  e.owner_id,
  t.bill_id
from public.transactions t
join public.accounts a  on a.id = t.account_id
left join public.entities e on e.id = a.entity_id;

-- 4) Meta: valor mensal planejado -----------------------------------------
-- O codigo da tela de metas ja grava monthly_amount, mas a coluna nunca foi
-- criada - createGoal/updateGoal quebram em producao sem isto.
alter table public.goals
  add column if not exists monthly_amount bigint not null default 0;

-- 5) Aportes de meta ------------------------------------------------------
-- goals.current_amount era um numero solto que o usuario editava; nao dava
-- para saber quanto entrou EM QUAL MES. Cada aporte vira uma linha aqui e o
-- total passa a ser derivado (ver v_goal_progress).
create table if not exists public.goal_contributions (
  id             text primary key default gen_random_uuid()::text,
  goal_id        text not null references public.goals(id) on delete cascade,
  household_id   text not null references public.households(id) on delete cascade,
  amount_cents   bigint not null,          -- negativo = retirada/correcao
  date           text not null,            -- 'YYYY-MM-DD', igual transactions.date
  note           text,
  transaction_id text references public.transactions(id) on delete set null,
  created_by_id  text references public.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_goal_contrib_goal on public.goal_contributions(goal_id, date desc);
create index if not exists idx_goal_contrib_household on public.goal_contributions(household_id, date desc);

-- Preserva o que ja estava em current_amount como aporte inicial, para o total
-- derivado nao zerar metas antigas. So roda uma vez (o "not exists" segura).
insert into public.goal_contributions (id, goal_id, household_id, amount_cents, date, note, created_at)
select
  g.id || ':saldo-inicial',
  g.id,
  g.household_id,
  g.current_amount,
  to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
  'Saldo anterior a migracao para aportes',
  now()
from public.goals g
where g.current_amount > 0
  and not exists (
    select 1 from public.goal_contributions c where c.id = g.id || ':saldo-inicial'
  );

-- 6) Progresso da meta ----------------------------------------------------
-- O dashboard le daqui: quanto falta e quanto entrou no mes corrente. Somar no
-- cliente daria numero diferente por tela.
create or replace view public.v_goal_progress as
select
  g.id                                    as goal_id,
  g.household_id,
  g.entity_id,
  e.owner_id,
  g.name,
  g.target_amount                         as target_cents,
  g.monthly_amount                        as planned_monthly_cents,
  g.target_date,
  coalesce(sum(c.amount_cents), 0)::bigint as contributed_total_cents,
  coalesce(sum(c.amount_cents) filter (
    where substr(c.date, 1, 7) = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ), 0)::bigint                            as contributed_this_month_cents,
  greatest(
    0,
    g.target_amount - coalesce(sum(c.amount_cents), 0)
  )::bigint                                as remaining_cents,
  max(c.date)                              as last_contribution_date
from public.goals g
left join public.entities e on e.id = g.entity_id
left join public.goal_contributions c on c.goal_id = g.id
group by g.id, g.household_id, g.entity_id, e.owner_id, g.name,
         g.target_amount, g.monthly_amount, g.target_date;
