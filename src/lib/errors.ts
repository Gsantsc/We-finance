// Erro com status HTTP. Vive num modulo proprio para o repo.ts poder lancar
// 404/403 sem importar api.ts (que importa auth.ts, que importa repo.ts) - e
// para o cliente (http.ts) reaproveitar os mesmos codigos sem puxar next/server.
//
// Toda resposta de erro da API tem o mesmo shape: { code, message }. O "code" e'
// estavel e serve para a tela decidir o que fazer; a "message" e' o texto ja
// pronto para o usuario. Detalhe interno (stack, erro do Postgres) nunca sai
// daqui - fica no log do servidor.

export type ApiErrorCode =
  | "VALIDACAO"
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "MUITAS_TENTATIVAS"
  | "ERRO_INTERNO";

const CODIGO_POR_STATUS: Record<number, ApiErrorCode> = {
  400: "VALIDACAO",
  401: "NAO_AUTENTICADO",
  403: "SEM_PERMISSAO",
  404: "NAO_ENCONTRADO",
  409: "CONFLITO",
  429: "MUITAS_TENTATIVAS",
};

export function codigoParaStatus(status: number): ApiErrorCode {
  return CODIGO_POR_STATUS[status] ?? (status >= 500 ? "ERRO_INTERNO" : "VALIDACAO");
}

export type ApiErrorBody = { code: ApiErrorCode; message: string };

export const MENSAGEM_ERRO_INTERNO = "Erro interno. Tente de novo em instantes.";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(message: string, status = 400, code?: ApiErrorCode) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? codigoParaStatus(status);
  }

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message };
  }
}

// Body de erro para qualquer excecao. Um erro que nao e' ApiError e' bug nosso
// ou falha de infra: vira 500 generico, sem repassar a mensagem crua (ela pode
// citar nome de tabela, connection string ou resposta bruta de terceiro).
export function corpoDeErro(err: unknown): { body: ApiErrorBody; status: number } {
  if (err instanceof ApiError) return { body: err.toBody(), status: err.status };
  return {
    body: { code: "ERRO_INTERNO", message: MENSAGEM_ERRO_INTERNO },
    status: 500,
  };
}
