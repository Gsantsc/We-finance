import { describe, expect, it } from "vitest";
import {
  ApiError,
  MENSAGEM_ERRO_INTERNO,
  codigoParaStatus,
  corpoDeErro,
} from "@/lib/errors";
import { ApiRequestError, mensagemDeErro } from "@/lib/http";

describe("@regression codigoParaStatus", () => {
  it("mapeia os status conhecidos", () => {
    expect(codigoParaStatus(400)).toBe("VALIDACAO");
    expect(codigoParaStatus(401)).toBe("NAO_AUTENTICADO");
    expect(codigoParaStatus(403)).toBe("SEM_PERMISSAO");
    expect(codigoParaStatus(404)).toBe("NAO_ENCONTRADO");
    expect(codigoParaStatus(429)).toBe("MUITAS_TENTATIVAS");
  });

  it("qualquer 5xx vira ERRO_INTERNO", () => {
    expect(codigoParaStatus(500)).toBe("ERRO_INTERNO");
    expect(codigoParaStatus(503)).toBe("ERRO_INTERNO");
  });
});

describe("@regression ApiError", () => {
  it("deriva o code do status quando nao vem explicito", () => {
    expect(new ApiError("nao achei", 404).code).toBe("NAO_ENCONTRADO");
  });

  it("respeita o code informado", () => {
    expect(new ApiError("regra propria", 400, "CONFLITO").code).toBe("CONFLITO");
  });
});

describe("@regression corpoDeErro", () => {
  it("ApiError vira { code, message } com o status dele", () => {
    const { body, status } = corpoDeErro(new ApiError("Transacao nao encontrada", 404));
    expect(status).toBe(404);
    expect(body).toEqual({ code: "NAO_ENCONTRADO", message: "Transacao nao encontrada" });
  });

  it("erro inesperado nao vaza a mensagem crua para o cliente", () => {
    const cru = new Error('relation "transactions" does not exist');
    const { body, status } = corpoDeErro(cru);
    expect(status).toBe(500);
    expect(body).toEqual({ code: "ERRO_INTERNO", message: MENSAGEM_ERRO_INTERNO });
    expect(JSON.stringify(body)).not.toContain("transactions");
  });

  it("nao serializa stack em hipotese nenhuma", () => {
    const cru = new Error("boom");
    expect(JSON.stringify(corpoDeErro(cru).body)).not.toContain("stack");
    expect(Object.keys(corpoDeErro(cru).body)).toEqual(["code", "message"]);
  });
});

describe("@regression mensagemDeErro", () => {
  it("usa a mensagem tratada que veio da API", () => {
    const err = new ApiRequestError("Dados invalidos - amount: precisa ser um numero", "VALIDACAO", 400);
    expect(mensagemDeErro(err)).toBe("Dados invalidos - amount: precisa ser um numero");
  });

  it("troca falha de rede por aviso de conexao (nada de 'Failed to fetch')", () => {
    expect(mensagemDeErro(new TypeError("Failed to fetch"))).toBe(
      "Sem conexao com o servidor. Tente de novo."
    );
  });

  it("tem texto de fallback para o que nao e' Error", () => {
    expect(mensagemDeErro("qualquer coisa")).toBe("Nao foi possivel completar a acao.");
    expect(mensagemDeErro(null)).toBe("Nao foi possivel completar a acao.");
  });
});
