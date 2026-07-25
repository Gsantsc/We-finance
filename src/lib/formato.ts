// Formatadores compartilhados pelas telas.

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const nomesMeses = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// "2026-02-01" (ou ISO com hora) -> "01/02/2026". Formata SO pela string,
// sem criar Date - assim o fuso do navegador nao empurra a data um dia atras
// (data e' competencia/dia, nao um instante).
export function formatDateBR(s: string | null | undefined): string {
  if (!s) return "";
  const p = String(s).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(s);
}

// "2026-07" -> "Jul/26" (rotulo curto para os graficos).
export function rotuloMesCurto(chave: string): string {
  const [ano, mes] = chave.split("-");
  const abrev = nomesMeses[Number(mes) - 1]?.slice(0, 3) || mes;
  return `${abrev}/${ano.slice(2)}`;
}
