-- Categoria Pet + a conta fixa passa a carregar categoria.
--
-- As contas fixas nasciam SEM categoria (bills.category_id nulo), e o lancamento
-- gerado herdava esse vazio. Resultado pratico: 15 despesas por mes caindo em
-- "sem categoria", o que faz o grafico de gastos por categoria mentir - o maior
-- gasto da casa (aluguel, condominio) simplesmente nao aparecia nele.

insert into public.categories (id, name, icon, is_income)
select gen_random_uuid()::text, v.name, v.icon, false
from (values
  ('Pet', '🐾')
) as v(name, icon)
where not exists (
  select 1 from public.categories c
  where public.sem_acento(c.name) = public.sem_acento(v.name)
);

-- Conta fixa sem categoria deixa de ser o normal: quando o lancamento e' gerado,
-- ele herda a daqui. Sem isso, categorizar teria que ser refeito todo mes.
create index if not exists idx_bills_category on public.bills(category_id);
