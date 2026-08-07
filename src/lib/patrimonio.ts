// Patrimônio líquido: a fórmula, escrita uma vez e testada.
//
// ---------------------------------------------------------------------------
//   PATRIMÔNIO LÍQUIDO = ATIVOS − PASSIVOS
//
//   ATIVOS   = saldos positivos das contas (corrente, poupança, dinheiro, vales)
//            + saldos positivos das contas de investimento
//
//   PASSIVOS = saldos NEGATIVOS de conta (fatura de cartão, cheque especial)
//            + saldo devedor dos parcelamentos
//            + contas fixas do mês ainda em aberto
// ---------------------------------------------------------------------------
//
// Duas regras que o calculo antigo errava:
//
// 1. SALDO DEVEDOR = parcela x parcelas que AINDA NAO VENCERAM.
//    Nao e' o valor original do emprestimo (ignora tudo que ja foi amortizado)
//    e nao e' o total de parcelas (a que ja venceu nao e' mais compromisso
//    futuro - ou foi paga, ou virou atraso, mas saiu do passivo).
//
// 2. Conta com saldo NEGATIVO e' passivo, nao ativo negativo. Somar tudo num
//    balde so dava o mesmo total liquido, mas escondia o tamanho da divida: uma
//    pessoa com 10.000 na conta e 9.000 de fatura nao tem "1.000 de patrimonio"
//    e pronto - ela tem 10.000 de ativo e 9.000 de passivo, e isso muda a
//    leitura. Por isso o breakdown separa os dois lados.
//
// TUDO EM CENTAVOS INTEIROS. Nenhuma etapa passa por float: 0.1 + 0.2 nao e'
// 0.3, e num saldo de patrimonio esse erro se acumula a cada conta somada.

/** Conta de investimento entra num grupo proprio no detalhamento. */
export const TIPO_INVESTIMENTO = "INVESTIMENTO";

export type ContaSaldo = {
  id: string;
  nome: string;
  tipo: string;
  saldoCents: number;
};

export type ParcelamentoAberto = {
  groupId: string;
  descricao: string;
  parcelaCents: number;
  parcelasRestantes: number;
};

export type ContaFixaAberta = {
  id: string;
  nome: string;
  valorCents: number;
};

export type EntradaPatrimonio = {
  contas: ContaSaldo[];
  parcelamentos: ParcelamentoAberto[];
  contasFixas: ContaFixaAberta[];
};

export type ItemPatrimonio = {
  rotulo: string;
  valorCents: number;
  detalhe?: string;
};

export type PatrimonyBreakdown = {
  ativosCents: number;
  passivosCents: number;
  liquidoCents: number;
  ativos: ItemPatrimonio[];
  passivos: ItemPatrimonio[];
};

export function calculatePatrimony(entrada: EntradaPatrimonio): PatrimonyBreakdown {
  const ativos: ItemPatrimonio[] = [];
  const passivos: ItemPatrimonio[] = [];

  for (const c of entrada.contas) {
    if (c.saldoCents > 0) {
      ativos.push({
        rotulo: c.nome,
        valorCents: c.saldoCents,
        detalhe: c.tipo === TIPO_INVESTIMENTO ? "Investimento" : "Conta",
      });
    } else if (c.saldoCents < 0) {
      // Cartao e cheque especial: o saldo negativo E' a divida.
      passivos.push({
        rotulo: c.nome,
        valorCents: Math.abs(c.saldoCents),
        detalhe: "Saldo negativo",
      });
    }
    // Saldo zero nao entra em lado nenhum - so polui o detalhamento.
  }

  for (const p of entrada.parcelamentos) {
    const restantes = Math.max(0, Math.trunc(p.parcelasRestantes));
    if (restantes === 0) continue; // parcelamento quitado nao e' passivo
    passivos.push({
      rotulo: p.descricao,
      valorCents: p.parcelaCents * restantes,
      // Sem formatar moeda aqui: esta funcao e pura e nao conhece locale.
      // O valor total do item ja aparece formatado ao lado, na UI.
      detalhe: `${restantes} ${restantes === 1 ? "parcela restante" : "parcelas restantes"}`,
    });
  }

  for (const b of entrada.contasFixas) {
    if (b.valorCents <= 0) continue;
    passivos.push({ rotulo: b.nome, valorCents: b.valorCents, detalhe: "Conta fixa em aberto" });
  }

  const ativosCents = ativos.reduce((s, i) => s + i.valorCents, 0);
  const passivosCents = passivos.reduce((s, i) => s + i.valorCents, 0);

  // Do maior para o menor: quem audita quer ver primeiro o que pesa.
  ativos.sort((a, b) => b.valorCents - a.valorCents);
  passivos.sort((a, b) => b.valorCents - a.valorCents);

  return { ativosCents, passivosCents, liquidoCents: ativosCents - passivosCents, ativos, passivos };
}
