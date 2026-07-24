// Formatadores compartilhados pelas telas.

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const nomesMeses = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// "2026-07" -> "Jul/26" (rotulo curto para os graficos).
export function rotuloMesCurto(chave: string): string {
  const [ano, mes] = chave.split("-");
  const abrev = nomesMeses[Number(mes) - 1]?.slice(0, 3) || mes;
  return `${abrev}/${ano.slice(2)}`;
}
