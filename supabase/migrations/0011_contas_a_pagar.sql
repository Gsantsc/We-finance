-- Contas a pagar: TODA conta a pagar vira lancamento.
--
-- Antes havia dois mundos que nao se falavam:
--   bills        = a recorrencia (nome, valor, dia do vencimento). Nao tinha
--                  linha por mes, entao "paguei o aluguel de agosto" nao existia
--                  como fato - so `last_paid_at`, que guardava UM pagamento e
--                  esquecia o historico.
--   transactions = o fato, mas sem vencimento nem status de pagamento.
--
-- Agora bills e' o MOLDE e transactions e' o FATO. Cada mes gera um lancamento
-- por conta fixa, e a partir dai tudo o que ja funciona para lancamento (resumo,
-- patrimonio, grafico, categoria) passa a valer para conta a pagar de graca.
--
-- O status NAO e' campo: e' derivado de due_date e paid_at. Status gravado a mao
-- vira mentira no dia seguinte - "em aberto" continua "em aberto" depois de
-- vencer, a menos que alguem rode um job para corrigir.

-- 1) Vencimento e pagamento no lancamento ------------------------------------
-- date      = COMPETENCIA (a que mes o gasto pertence)
-- due_date  = VENCIMENTO  (quando tem que pagar)
-- Sao coisas diferentes: a fatura de agosto vence em 10/09.
alter table public.transactions
  add column if not exists due_date text,
  add column if not exists paid_at  text;

-- Sem vencimento proprio, a competencia serve de vencimento. Vale para tudo que
-- ja existia antes desta migracao.
update public.transactions set due_date = date where due_date is null;

create index if not exists idx_tx_due_date
  on public.transactions(due_date) where due_date is not null;
create index if not exists idx_tx_em_aberto
  on public.transactions(due_date) where paid_at is null;

-- 2) Uma conta fixa gera UM lancamento por mes -------------------------------
-- O indice unico e' o que torna a geracao idempotente: abrir o mesmo mes duas
-- vezes nao duplica a conta.
create unique index if not exists idx_tx_bill_mes
  on public.transactions(bill_id, substr(date, 1, 7)) where bill_id is not null;

-- 3) A recorrencia precisa saber quando comeca e quando acaba -----------------
alter table public.bills
  add column if not exists category_id text references public.categories(id) on delete set null,
  add column if not exists account_id  text references public.accounts(id) on delete set null,
  add column if not exists inicio      text,   -- 'YYYY-MM'; null = desde sempre
  add column if not exists fim         text,   -- 'YYYY-MM'; null = sem prazo
  add column if not exists ativa       boolean not null default true;

update public.bills set inicio = coalesce(inicio, substr(created_at, 1, 7)) where inicio is null;

-- 4) A lista unificada do mes ------------------------------------------------
-- Junta num lugar so o que ate agora estava espalhado: conta fixa gerada,
-- parcela de compra, parcela de emprestimo e despesa avulsa. A tela nao precisa
-- saber a origem para montar a lista - ela vem carimbada em `origem`.
create or replace view public.v_contas_a_pagar as
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
  case
    when t.bill_id is not null                then 'recorrente'
    when p.modo = 'fixed'                     then 'emprestimo'
    when t.installment_group_id is not null   then 'parcela'
    else 'avulsa'
  end                                 as origem,
  -- Status derivado. Nunca gravado: "em aberto" tem que virar "atrasado"
  -- sozinho quando o dia passa.
  case
    when t.paid_at is not null then 'pago'
    when coalesce(t.due_date, t.date)
         < to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') then 'atrasado'
    else 'em_aberto'
  end                                 as status
from public.transactions t
join public.accounts a   on a.id = t.account_id
left join public.entities e   on e.id = a.entity_id
left join public.users u      on u.id = e.owner_id
left join public.categories c on c.id = t.category_id
left join public.installment_plans p on p.group_id = t.installment_group_id
where t.type = 'expense';
