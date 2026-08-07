// Quando apagar e' seguro, e o que dizer quando nao e'.
//
// Apagar uma conta ou uma divisao NAO pode ser um DELETE solto: os lancamentos
// apontam para elas. Deixar o banco resolver daria um de dois finais ruins -
// ON DELETE CASCADE apagaria o historico financeiro junto (silenciosamente), ou
// a FK estouraria um erro de Postgres cru na cara do usuario.
//
// Aqui a decisao e' explicita e testada, e a mensagem diz O QUE fazer, nao so
// que deu errado.

export type Impedimento = {
  podeApagar: false;
  motivo: string;
  saida: string;
};

export type Liberado = { podeApagar: true };

export type VeredictoExclusao = Impedimento | Liberado;

const LIBERADO: Liberado = { podeApagar: true };

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${muitos}`;
}

// Conta com lancamento nao se apaga: some o extrato junto. Arquivar tira da
// frente e preserva o historico, que e' o que a pessoa quase sempre quer.
export function podeApagarConta(uso: {
  lancamentos: number;
  contasFixas: number;
  parcelamentos: number;
}): VeredictoExclusao {
  if (uso.lancamentos > 0) {
    return {
      podeApagar: false,
      motivo: `Esta conta tem ${plural(uso.lancamentos, "lançamento", "lançamentos")}.`,
      saida: "Arquive a conta: ela sai das listas e o histórico continua inteiro.",
    };
  }
  if (uso.contasFixas > 0) {
    return {
      podeApagar: false,
      motivo: `${plural(uso.contasFixas, "conta fixa aponta", "contas fixas apontam")} para ela.`,
      saida: "Aponte essas contas fixas para outra conta antes de apagar.",
    };
  }
  if (uso.parcelamentos > 0) {
    return {
      podeApagar: false,
      motivo: `${plural(uso.parcelamentos, "parcelamento usa", "parcelamentos usam")} esta conta.`,
      saida: "Apague os parcelamentos primeiro, ou arquive a conta.",
    };
  }
  return LIBERADO;
}

// Divisao e' o agrupador. Apagar uma que ainda tem conta deixaria as contas
// orfas e o painel perderia a coluna da pessoa sem avisar.
export function podeApagarDivisao(uso: {
  contas: number;
  contasFixas: number;
  metas: number;
  orcamentos: number;
}): VeredictoExclusao {
  if (uso.contas > 0) {
    return {
      podeApagar: false,
      motivo: `Esta divisão tem ${plural(uso.contas, "conta", "contas")}.`,
      saida: "Mova as contas para outra divisão antes de apagar.",
    };
  }
  const outros =
    (uso.contasFixas > 0 ? ["contas fixas"] : [])
      .concat(uso.metas > 0 ? ["metas"] : [])
      .concat(uso.orcamentos > 0 ? ["orçamentos"] : []);
  if (outros.length > 0) {
    return {
      podeApagar: false,
      motivo: `Ainda há ${outros.join(", ")} ligados a esta divisão.`,
      saida: "Apague ou mova esses itens antes.",
    };
  }
  return LIBERADO;
}

// Texto da confirmacao. Centralizado para todas as telas perguntarem igual -
// confirmacao que muda de tom a cada tela ensina o usuario a clicar no
// automatico, que e' o oposto do que ela existe para fazer.
export function textoConfirmarExclusao(o: {
  tipo: string;
  nome: string;
  consequencia?: string;
}): string {
  const base = `Apagar ${o.tipo} "${o.nome}"?`;
  return o.consequencia ? `${base}\n\n${o.consequencia}` : base;
}
