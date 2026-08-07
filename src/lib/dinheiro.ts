// Dinheiro: como e' guardado, como e' somado e como e' exibido.
//
// ---------------------------------------------------------------------------
// DECISAO DE DOMINIO — o sinal NAO existe no banco
// ---------------------------------------------------------------------------
// transactions.amount_cents e' bigint e SEMPRE POSITIVO (ha um CHECK no banco:
// transactions_amount_nonneg). O sentido do dinheiro vem de transactions.type,
// que e' 'income' ou 'expense'. O mesmo vale para bills.amount, goals.*,
// budgets.amount e accounts.balance - todos magnitudes, exceto accounts.balance,
// que e' saldo e pode ser negativo de verdade (cartao, cheque especial).
//
// Consequencia pratica, e a origem do bug de dupla negacao:
//   - as agregacoes (v_monthly_overview, resumoDoMes) devolvem MAGNITUDES.
//     `saiu = 4560.32` quer dizer "sairam 4.560,32", nao "-4.560,32".
//   - o sinal e' aplicado UMA VEZ, na hora de mostrar.
//
// Por isso formatarDinheiro/<Money> recebem o fluxo em vez de confiar no sinal
// do numero: com "saida" o valor e' forcado a negativo via -Math.abs(), entao
// passar 4560.32 ou -4560.32 da o mesmo resultado. Dupla negacao fica impossivel
// por construcao, e nao por disciplina de quem chama.
//
// Valores em reais circulam como number apenas na BORDA (API -> tela). Toda
// conta que importa acontece em centavos inteiros no banco ou em rules.ts.

export type Fluxo =
  | "entrada" // dinheiro que chega: positivo, verde
  | "saida" // dinheiro que sai: negativo, vermelho
  | "auto" // o proprio numero manda (ex.: sobra, saldo, variacao)
  | "neutro"; // magnitude pura, sem sinal nem cor (ex.: um alvo de meta)

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Sinal explicito para saida/entrada. O "−" e' o menos tipografico (U+2212),
// nao o hifen: alinha melhor com os digitos tabulares das tabelas.
const MENOS = "−";

export function valorComFluxo(valor: number, fluxo: Fluxo = "auto"): number {
  if (fluxo === "saida") return -Math.abs(valor);
  if (fluxo === "entrada") return Math.abs(valor);
  if (fluxo === "neutro") return Math.abs(valor);
  return valor;
}

export function formatarDinheiro(valor: number, fluxo: Fluxo = "auto"): string {
  const v = valorComFluxo(valor, fluxo);
  // Zero nunca leva sinal: "−R$ 0,00" e' ruido e sugere um debito que nao existe.
  if (v === 0) return BRL.format(0);
  if (v < 0) return `${MENOS}${BRL.format(Math.abs(v))}`;
  return BRL.format(v);
}

// Classe de cor correspondente, para a cor nunca discordar do sinal.
export function corDoFluxo(valor: number, fluxo: Fluxo = "auto"): string {
  const v = valorComFluxo(valor, fluxo);
  if (v === 0) return "text-ink";
  return v < 0 ? "text-clay" : "text-pine-600";
}
