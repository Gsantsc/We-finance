// Cliente HTTP usado pelas telas.
//
// As rotas de API respondem { code, message } com status de erro quando algo
// nao passa na validacao ou a sessao caiu. Sem isto, a tela tentaria renderizar
// esse objeto como se fosse a lista e quebraria em branco.
//
// O erro chega na tela como ApiRequestError: "message" ja e' texto para o
// usuario e "code" permite tratar caso a caso (ex.: 401 -> mandar pro login).
// Nada de stack no console do cliente - quem tem o detalhe e' o log do servidor.

import { codigoParaStatus, type ApiErrorCode } from "./errors";

export class ApiRequestError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function unwrap(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      data?.message || `Falha na requisicao (${res.status})`,
      data?.code ?? codigoParaStatus(res.status),
      res.status
    );
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

export function patchJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(unwrap);
}

// DELETE tambem passa pelo unwrap: fetch cru nao levanta em 4xx/5xx, entao a
// tela recarregava como se tivesse apagado quando nao apagou.
export function deleteJson<T>(url: string): Promise<T> {
  return fetch(url, { method: "DELETE" }).then(unwrap);
}

// Texto pronto para o ErroBanner a partir de qualquer excecao capturada numa
// tela. Erro de rede (fetch rejeitado) nao tem "message" util, entao vira aviso
// de conexao em vez de "Failed to fetch".
export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof TypeError) return "Sem conexão com o servidor. Tente de novo.";
  if (err instanceof Error && err.message) return err.message;
  return "Não foi possível completar a ação.";
}
