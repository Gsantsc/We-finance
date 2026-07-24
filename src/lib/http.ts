// Cliente HTTP usado pelas telas.
//
// As rotas de API agora respondem { error: "..." } com status de erro quando
// algo nao passa na validacao ou a sessao caiu. Sem isto, a tela tentaria
// renderizar esse objeto como se fosse a lista e quebraria em branco.

async function unwrap(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Falha na requisicao (${res.status})`);
  }
  return data;
}

export function getJson<T>(url: string): Promise<T> {
  return fetch(url).then(unwrap);
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(unwrap);
}
