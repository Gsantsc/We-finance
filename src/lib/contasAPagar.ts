// Regras puras das contas a pagar. Sem I/O, sem SQL, sem React.
//
// O status ficava na view (v_contas_a_pagar). Saiu de la e veio para ca por um
// motivo: em SQL ele nao tem teste. Como o app ja filtra em JavaScript, manter a
// derivacao no banco significava DUAS fontes possiveis para a mesma resposta -
// a hora em que elas divergissem, ninguem perceberia.

export type StatusConta = "pago" | "atrasado" | "em_aberto";
export type OrigemConta = "recorrente" | "emprestimo" | "parcela" | "avulsa";

// Status nao e' campo gravado, e' consequencia. Gravado a mao, "em aberto"
// continuaria "em aberto" no dia seguinte ao vencimento, a menos que alguem
// rodasse um job para corrigir. Aqui ele muda sozinho quando o dia passa.
export function statusDaConta(
  vencimento: string,
  pagoEm: string | null | undefined,
  hoje: string
): StatusConta {
  if (pagoEm) return "pago";
  // Comparacao de string funciona porque as datas sao ISO 'YYYY-MM-DD', que
  // ordena igual a data. Nada de Date aqui - Date traria fuso de volta.
  return vencimento.slice(0, 10) < hoje.slice(0, 10) ? "atrasado" : "em_aberto";
}

export function diasDeAtraso(vencimento: string, hoje: string): number {
  if (vencimento.slice(0, 10) >= hoje.slice(0, 10)) return 0;
  // Meio-dia dos dois lados: imuniza contra horario de verao, que faria uma das
  // pontas ter 23 ou 25 horas e arredondar para o dia errado.
  const a = new Date(`${vencimento.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${hoje.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Dia 31 num mes de 30 cai no ULTIMO dia, nao vira o mes seguinte. Sem o clamp,
// "vence todo dia 31" geraria 01/03 em fevereiro - um vencimento no mes errado.
export function vencimentoNoMes(mes: string, diaDoMes: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(Math.trunc(diaDoMes), 1), ultimoDia);
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

// A recorrencia vale naquele mes? inicio/fim sao 'YYYY-MM' e podem ser nulos
// (null = sem limite daquele lado).
export function recorrenciaValeNoMes(
  mes: string,
  inicio: string | null | undefined,
  fim: string | null | undefined,
  ativa = true
): boolean {
  if (!ativa) return false;
  if (inicio && mes < inicio) return false;
  if (fim && mes > fim) return false;
  return true;
}

export function origemDaConta(item: {
  billId?: string | null;
  groupId?: string | null;
  modoDoPlano?: string | null;
}): OrigemConta {
  if (item.billId) return "recorrente";
  if (item.modoDoPlano === "fixed") return "emprestimo";
  if (item.groupId) return "parcela";
  return "avulsa";
}

export type ResumoContas = {
  total: number;
  pago: number;
  emAberto: number;
  atrasado: number;
  quantidade: number;
};

// Os totais sao sempre do MES INTEIRO, nunca do que sobrou depois do filtro:
// quem filtra por "atrasado" ainda precisa saber quanto e' o mes todo, senao o
// resumo no topo contradiz a propria tela.
export function resumirContas(
  itens: { valor: number; status: StatusConta }[]
): ResumoContas {
  const soma = (f: (i: { status: StatusConta }) => boolean) =>
    itens.filter(f).reduce((s, i) => s + i.valor, 0);
  return {
    total: soma(() => true),
    pago: soma((i) => i.status === "pago"),
    emAberto: soma((i) => i.status === "em_aberto"),
    atrasado: soma((i) => i.status === "atrasado"),
    quantidade: itens.length,
  };
}
