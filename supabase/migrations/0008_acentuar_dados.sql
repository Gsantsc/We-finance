-- Acentuacao dos registros que o usuario criou (entidades, contas, contas a
-- pagar). Complementa 0007, que cuidou das categorias e da interface.
--
-- Seguro do ponto de vista referencial: transactions, budgets, goals e bills
-- apontam por id, nunca por nome. Nenhuma logica do app casa por esses nomes -
-- a unica comparacao por nome que existe e' a de salario em v_monthly_overview,
-- que olha CATEGORIA (ja tratada em 0007) e agora usa sem_acento nos dois lados.
--
-- So renomeia quando o nome atual bate exatamente, entao rodar duas vezes nao
-- faz nada e um nome ja corrigido a mao e' preservado.

do $$
declare
  par record;
begin
  -- entities ---------------------------------------------------------------
  for par in
    select * from (values
      ('Cartao de Credito',    'Cartão de Crédito'),
      ('Salario Gabriel',      'Salário Gabriel'),
      ('Salario Thamires',     'Salário Thamires'),
      ('Salario Dia 15 Thami', 'Salário dia 15 Thamires'),
      ('Investimento Gabriel', 'Investimento Gabriel'),
      ('Prev Thamires',        'Previdência Thamires')
    ) as t(de, para)
  loop
    update public.entities set name = par.para
     where name = par.de and par.de <> par.para;
  end loop;

  -- accounts ---------------------------------------------------------------
  -- "Salario dia  15" tem espaco duplo no meio, alem da falta de acento.
  for par in
    select * from (values
      ('Credito',         'Crédito'),
      ('Salario dia  15', 'Salário dia 15'),
      ('Prev',            'Previdência')
    ) as t(de, para)
  loop
    update public.accounts set name = par.para where name = par.de;
  end loop;

  -- bills ------------------------------------------------------------------
  for par in
    select * from (values
      ('Condominio', 'Condomínio')
    ) as t(de, para)
  loop
    update public.bills set name = par.para where name = par.de;
  end loop;
end $$;
