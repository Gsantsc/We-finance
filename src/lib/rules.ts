// Regras de negocio puras (sem I/O), extraidas de repo.ts e das telas para
// poderem ser testadas isoladamente do banco e do React.

// Divide um total (em CENTAVOS) em n parcelas inteiras. O resto da divisao vai
// para a ULTIMA parcela, entao a soma das parcelas bate exatamente com o total
// (1000,00 em 3x -> 33333, 33333, 33334). Nunca deixa o float resolver.
export function splitInstallmentCents(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const parts = new Array(n).fill(base);
  parts[n - 1] += totalCents - base * n;
  return parts;
}

// Soma k meses a uma data "YYYY-MM-DD" mantendo o dia (com clamp para o ultimo
// dia do mes, ex. 31/01 + 1 mes -> 28/02). So string, sem fuso.
export function addMonths(dateOnly: string, k: number): string {
  const [y, m, d] = dateOnly.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1; // 1-12
  const ultimoDia = new Date(ny, nm, 0).getDate(); // dias do mes nm
  const nd = Math.min(d, ultimoDia);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export type BillStatus = {
  pagoEsteMes: boolean;
  vencido: boolean;
  diasAteVencer: number | null;
  vencimentoISO: string;
};

// "Pago este mes?" = ultimo pagamento caiu no mes/ano atual.
// Vencimento deste mes ajusta se o mes nao tem aquele dia (ex. dia 31 em fevereiro).
export function billStatus(dueDay: number, lastPaidAt: string | null, hoje = new Date()): BillStatus {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-11
  const diaHoje = hoje.getDate();

  let pagoEsteMes = false;
  if (lastPaidAt) {
    const p = new Date(lastPaidAt);
    pagoEsteMes = p.getFullYear() === ano && p.getMonth() === mes;
  }

  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(dueDay, ultimoDia);
  const vencimento = new Date(ano, mes, dia);
  const vencido = !pagoEsteMes && diaHoje > dia;

  return {
    pagoEsteMes,
    vencido,
    diasAteVencer: pagoEsteMes ? null : dia - diaHoje,
    vencimentoISO: vencimento.toISOString().slice(0, 10),
  };
}

// Vencidas primeiro, depois pendentes, pagas por ultimo; dentro de cada grupo, por dia.
export function sortBills<T extends { vencido: boolean; pagoEsteMes: boolean; dueDay: number }>(
  bills: T[]
): T[] {
  return [...bills].sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    if (a.pagoEsteMes !== b.pagoEsteMes) return a.pagoEsteMes ? 1 : -1;
    return a.dueDay - b.dueDay;
  });
}

// "deposito" soma ao valor atual; os demais campos sao substituicoes diretas.
// Nunca fica negativo (um deposito negativo maior que o saldo zera, nao inverte).
export function nextGoalAmount(
  currentAmount: number,
  patch: { deposito?: number; currentAmount?: number }
): number {
  const base =
    patch.deposito !== undefined
      ? currentAmount + patch.deposito
      : patch.currentAmount === undefined
      ? currentAmount
      : patch.currentAmount;
  return Math.max(0, base);
}

export function goalPercent(atual: number, alvo: number): number {
  return alvo > 0 ? Math.min(100, Math.round((atual / alvo) * 100)) : 0;
}

export function percentUsado(gasto: number, amount: number): number {
  return amount > 0 ? Math.round((gasto / amount) * 100) : 0;
}

export type BarColor = "emerald" | "amber" | "red";

// Barra de progresso do orcamento: verde ate 80%, ambar ate 100%, vermelho se estourar.
export function budgetBarColor(percent: number): BarColor {
  if (percent > 100) return "red";
  if (percent > 80) return "amber";
  return "emerald";
}
