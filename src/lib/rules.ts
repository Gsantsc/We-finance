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

// Repete o valor informado em cada parcela. Usado quando o usuario ja esta
// cadastrando o valor mensal da divida (ex.: emprestimo de 715 em 48x).
export function repeatInstallmentCents(installmentCents: number, n: number): number[] {
  return new Array(n).fill(installmentCents);
}

// Como ler o valor digitado num parcelamento:
//   "split" - compra em Nx: o valor e' o TOTAL da compra, dividido em n parcelas.
//   "fixed" - parcela fixa / emprestimo: o valor e' o de CADA parcela; o total
//             e' valor x n. E' o caso do emprestimo (715 em 48x = 48 x 715),
//             onde dividir estaria errado.
export type InstallmentMode = "split" | "fixed";

export function installmentPlanCents(
  amountCents: number,
  n: number,
  mode: InstallmentMode
): number[] {
  return mode === "split"
    ? splitInstallmentCents(amountCents, n)
    : repeatInstallmentCents(amountCents, n);
}

// Categorias em que dividir o valor esta ERRADO por definicao. Quem digita
// "715 em 48x" num emprestimo quer 48 parcelas DE 715, nunca 48 de 14,90 - e foi
// exatamente esse o bug relatado. O default do formulario sai daqui, entao a
// pessoa nao precisa saber que existe um modo para acertar.
const CATEGORIAS_PARCELA_FIXA = ["emprestimo", "financiamento", "consorcio"];

export function modoPadraoDaCategoria(nomeCategoria?: string | null): InstallmentMode {
  if (!nomeCategoria) return "split";
  const normalizado = nomeCategoria
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira os acentos combinantes
    .toLowerCase();
  return CATEGORIAS_PARCELA_FIXA.some((c) => normalizado.includes(c)) ? "fixed" : "split";
}

export type ResumoParcelamento = {
  parcelas: number;
  primeiraCents: number;
  ultimaCents: number;
  totalCents: number;
  /** "YYYY-MM" da ultima competencia. */
  ultimoMes: string;
  /** true quando o resto da divisao caiu na ultima parcela. */
  ultimaDiferente: boolean;
};

// O que o formulario mostra ANTES de gravar. Existe para o usuario conferir a
// interpretacao do valor: os dois modos partem do mesmo "715" e "48x" e chegam
// a totais que diferem em quase 34 mil reais.
export function resumirParcelamento(
  amountCents: number,
  n: number,
  mode: InstallmentMode,
  primeiraData: string
): ResumoParcelamento {
  const partes = installmentPlanCents(amountCents, n, mode);
  return {
    parcelas: n,
    primeiraCents: partes[0],
    ultimaCents: partes[n - 1],
    totalCents: partes.reduce((s, x) => s + x, 0),
    ultimoMes: addMonthKey(primeiraData, n - 1),
    ultimaDiferente: partes[n - 1] !== partes[0],
  };
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

// Le um valor digitado em pt-BR ("1.500,50", "1500,50", "-20") em number.
//
// parseFloat sozinho le a grafia brasileira errado e CALADO: "1.500,50" vira
// 1.5, porque ele para no primeiro caractere invalido. Como o app EXIBE dinheiro
// em pt-BR, o usuario digita do jeito que le na tela.
export function lerValorBR(entrada: string): number | null {
  const limpo = entrada.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!limpo) return null;

  // "10.000" e' dez mil em pt-BR e dez em en - o ponto e' ambiguo. Regra:
  //   1) tem virgula     -> ela e' o decimal, os pontos sao milhar ("1.500,50")
  //   2) grupos de 3     -> os pontos sao milhar ("10.000", "1.234.567")
  //   3) qualquer outra  -> o ponto e' decimal ("1500.50")
  // O app exibe dinheiro em pt-BR, entao o caso 2 tem que ganhar do 3: quem
  // digita "10.000" esta copiando o que le na tela.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(limpo)
    ? limpo.replace(/\./g, "")
    : limpo;

  if (!/^-?\d*\.?\d+$/.test(normalizado)) return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// Hoje no fuso de Sao Paulo, como "YYYY-MM-DD".
//
// new Date().toISOString() devolve UTC. Como BRT e' UTC-3, das 21h em diante o
// UTC ja esta no dia seguinte: um gasto lancado 22h de 31/07 virava 01/08 e caia
// no mes errado. Pior, as views do banco usam now() at time zone 'America/
// Sao_Paulo', entao servidor e cliente discordavam de qual mês e' "o corrente".
// en-CA formata justamente como YYYY-MM-DD.
export function dataDeHojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// Mes de competencia corrente ("YYYY-MM") no mesmo fuso das views.
export function mesDeHojeSP(agora = new Date()): string {
  return dataDeHojeSP(agora).slice(0, 7);
}

// Soma k meses a uma chave "YYYY-MM" (o seletor do dashboard). Sem Date, sem
// fuso - so aritmetica, para dezembro->janeiro nao virar o ano errado.
export function addMonthKey(monthKey: string, k: number): string {
  const [y, m] = monthKey.slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// As tres colunas do resumo do mes, a partir do que ja foi agregado pelas views.
//
// Regra que nao pode quebrar: entrou - saiu - guardado tem que dar o MESMO
// numero que receitas - despesas - contasFixas - aportes. Se as duas contas
// divergirem, a tabela para de fechar e o usuario ve uma sobra que nao confere
// com os cartoes de cima.
export type ResumoEntrada = {
  receitas: number;
  despesas: number;
  salario: number;
  va: number;
  vr: number;
  investido: number;
  parcelas: number;
  contasFixas: number;
  aportes: number;
};

export function resumoDoMes(e: ResumoEntrada) {
  // Sobra da receita depois dos pedacos com nome proprio. Sem esta linha, uma
  // entrada sem categoria sumia da tabela e o total nao batia com o cartao.
  const outrasEntradas = Math.max(0, e.receitas - e.salario - e.va - e.vr - e.investido);
  const outrosGastos = Math.max(0, e.despesas - e.parcelas);

  // Investimento entra em "entrou", nao em "guardado": sem conceito de
  // transferencia, mandar dinheiro para a conta de investimento vira despesa
  // numa conta e entrada na outra, e as duas precisam se anular.
  const entrou = e.salario + e.va + e.vr + e.investido + outrasEntradas;
  const saiu = e.parcelas + outrosGastos + e.contasFixas;
  const guardado = e.aportes;

  return { outrasEntradas, outrosGastos, entrou, saiu, guardado, sobra: entrou - saiu - guardado };
}

export type BillStatus = {
  pagoEsteMes: boolean;
  vencido: boolean;
  diasAteVencer: number | null;
  vencimentoISO: string;
};

// "Pago este mês?" = ultimo pagamento caiu no mes/ano atual.
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
