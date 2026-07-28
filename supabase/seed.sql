-- Categorias base. Rerunnable: so insere o que ainda nao existe.
--
-- TRADUZIDO do rascunho original, que nao roda aqui:
--   * categories neste banco e' (id text, name, icon, is_income boolean).
--     Nao ha coluna kind nem user_id - nao existe categoria "de sistema" vs
--     "do usuario": a tabela e' global e compartilhada.
--   * name tem UNIQUE GLOBAL. O rascunho insere 'Outros' como despesa E como
--     receita, o que estoura categories_name_key. So a despesa entra.
--   * as 15 categorias que ja existem estao SEM ACENTO ('Alimentacao',
--     'Salario'). Inserir as versoes acentuadas criaria gemeas: a lista abaixo
--     segue a grafia que ja esta no banco.
--   * id nao tem default na tabela, entao e' gerado aqui.

insert into public.categories (id, name, icon, is_income)
select gen_random_uuid()::text, v.name, v.icon, v.is_income
from (values
  -- despesas que faltavam
  ('Mercado',    '🛒', false),
  ('Contas',     '🧾', false),   -- luz, agua, internet
  ('Vestuario',  '👕', false),
  -- receitas que faltavam
  ('Freelance',  '💼', true),
  ('Rendimentos','📈', true),
  ('Reembolso',  '↩️', true)
) as v(name, icon, is_income)
where not exists (
  select 1 from public.categories c where c.name = v.name
);
