-- A divida de parcelamento passa a sair do LEDGER, nao de installment_plans.
--
-- BUG: v_installment_debt partia de installment_plans. Essa tabela so ganha
-- linha quando um parcelamento e' criado DEPOIS do Bloco 4 - os que ja existiam
-- tem installment_group_id nas transactions e nenhum plano. Resultado: o
-- patrimonio ignorava R$ 21.276,00 de parcelas futuras e mostrava um numero
-- otimista demais, sem nada denunciando a falta.
--
-- Partir das transactions elimina a classe inteira do problema: se as parcelas
-- existem, a divida existe. O plano vira o que sempre deveria ter sido - fonte
-- de METADADO opcional (credor, juros), nunca a fonte da verdade sobre o saldo.
--
-- SALDO DEVEDOR = SOMA das parcelas que ainda nao venceram, e nao
-- parcela x quantidade: numa compra dividida com resto na ultima parcela
-- (33,33 / 33,33 / 33,34) a multiplicacao erraria por centavos, e centavo
-- errado em divida vira desconfianca no numero inteiro.

-- A ordem das colunas muda, e create or replace nao aceita isso. Nada mais no
-- banco depende desta view (so o repo consulta), entao dropar e' seguro.
drop view if exists public.v_installment_debt;

create view public.v_installment_debt as
select
  a.household_id,
  t.installment_group_id                                   as group_id,
  min(t.description)                                       as descricao,
  max(p.creditor)                                          as creditor,
  max(t.installment_total)                                 as installments_total,
  min(substr(t.date, 1, 7))                                as first_month,
  max(substr(t.date, 1, 7))                                as last_month,
  -- Valor de referencia da parcela, so para o rotulo ("3 parcelas restantes").
  max(t.amount_cents)                                      as installment_cents,
  count(*) filter (
    where substr(t.date, 1, 7) > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  )::int                                                   as parcelas_restantes,
  coalesce(sum(t.amount_cents) filter (
    where substr(t.date, 1, 7) > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  ), 0)::bigint                                            as saldo_devedor_cents
from public.transactions t
join public.accounts a on a.id = t.account_id
left join public.installment_plans p on p.group_id = t.installment_group_id
where t.installment_group_id is not null and t.type = 'expense'
group by a.household_id, t.installment_group_id;
