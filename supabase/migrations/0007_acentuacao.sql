-- Acentuacao do texto que o usuario le.
--
-- As categorias nasceram sem acento ("Alimentacao", "Salario") e aparecem em
-- toda tela. Renomear e' seguro do ponto de vista referencial - budgets,
-- categorization_rules e transactions apontam por id, nunca por nome.
--
-- MAS v_monthly_overview detecta salario por NOME (ilike 'salario%'), entao
-- renomear para "Salário" quebraria a linha Salario do dashboard sem erro
-- nenhum: o numero simplesmente viraria zero. A view e' recriada ANTES do
-- rename, comparando sem acento nos dois lados.

-- 1) Comparacao insensivel a acento -----------------------------------------
-- Sem depender da extensao unaccent (que pode nao estar habilitada). Resolve os
-- dois sentidos de uma vez: funciona com a categoria escrita "Salario" ou
-- "Salário", e continua funcionando se o usuario criar a dele de qualquer jeito.
create or replace function public.sem_acento(txt text)
returns text language sql immutable strict parallel safe as $$
  select translate(
    lower(txt),
    'áàâãäéèêëíìîïóòôõöúùûüñç',
    'aaaaaeeeeiiiiooooouuuunc'
  );
$$;

-- 2) v_monthly_overview com a deteccao de salario robusta --------------------
create or replace view public.v_monthly_overview as
select
  s.household_id,
  case when grouping(s.owner_id) = 1 then null else s.owner_id end as owner_id,
  grouping(s.owner_id) = 1 as is_household_total,
  s.month,
  coalesce(sum(s.amount_cents) filter (
    where s.type = 'income' and public.sem_acento(c.name) like 'salario%'
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

-- 3) Categorias acentuadas ---------------------------------------------------
-- Só renomeia se o destino ainda nao existir, para nao estourar a unique de
-- categories.name caso a migracao rode duas vezes ou o nome ja tenha sido
-- corrigido a mao.
do $$
declare
  par record;
begin
  for par in
    select * from (values
      ('Alimentacao',   'Alimentação'),
      ('Educacao',      'Educação'),
      ('Saude',         'Saúde'),
      ('Servicos PJ',   'Serviços PJ'),
      ('Transferencia', 'Transferência'),
      ('Salario',       'Salário'),
      ('Vestuario',     'Vestuário')
    ) as t(de, para)
  loop
    if exists (select 1 from public.categories where name = par.de)
       and not exists (select 1 from public.categories where name = par.para) then
      update public.categories set name = par.para where name = par.de;
    end if;
  end loop;
end $$;
