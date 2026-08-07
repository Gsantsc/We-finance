import { describe, expect, it } from "vitest";
import {
  podeApagarConta,
  podeApagarDivisao,
  textoConfirmarExclusao,
} from "@/lib/exclusao";

const contaLimpa = { lancamentos: 0, contasFixas: 0, parcelamentos: 0 };
const divisaoLimpa = { contas: 0, contasFixas: 0, metas: 0, orcamentos: 0 };

describe("@regression podeApagarConta", () => {
  it("conta sem nada apontando pode ser apagada", () => {
    expect(podeApagarConta(contaLimpa)).toEqual({ podeApagar: true });
  });

  it("conta COM lancamento nao pode: apagar levaria o extrato junto", () => {
    const r = podeApagarConta({ ...contaLimpa, lancamentos: 42 });
    expect(r.podeApagar).toBe(false);
    if (!r.podeApagar) {
      expect(r.motivo).toContain("42 lançamentos");
      // A mensagem tem que dizer O QUE FAZER, nao so que deu errado.
      expect(r.saida).toContain("Arquive");
    }
  });

  it("singular e plural saem certos", () => {
    const um = podeApagarConta({ ...contaLimpa, lancamentos: 1 });
    if (!um.podeApagar) expect(um.motivo).toContain("1 lançamento");
    const varios = podeApagarConta({ ...contaLimpa, lancamentos: 2 });
    if (!varios.podeApagar) expect(varios.motivo).toContain("2 lançamentos");
  });

  it("conta fixa apontando tambem impede, com saida propria", () => {
    const r = podeApagarConta({ ...contaLimpa, contasFixas: 3 });
    expect(r.podeApagar).toBe(false);
    if (!r.podeApagar) expect(r.saida).toContain("outra conta");
  });

  it("parcelamento impede", () => {
    const r = podeApagarConta({ ...contaLimpa, parcelamentos: 1 });
    expect(r.podeApagar).toBe(false);
    if (!r.podeApagar) expect(r.motivo).toContain("1 parcelamento");
  });

  it("lancamento e' o motivo mais forte quando ha varios impedimentos", () => {
    const r = podeApagarConta({ lancamentos: 5, contasFixas: 2, parcelamentos: 1 });
    if (!r.podeApagar) expect(r.motivo).toContain("lançamentos");
  });
});

describe("@regression podeApagarDivisao", () => {
  it("divisao vazia pode ser apagada", () => {
    expect(podeApagarDivisao(divisaoLimpa)).toEqual({ podeApagar: true });
  });

  it("divisao COM conta nao pode: as contas ficariam orfas", () => {
    const r = podeApagarDivisao({ ...divisaoLimpa, contas: 2 });
    expect(r.podeApagar).toBe(false);
    if (!r.podeApagar) {
      expect(r.motivo).toContain("2 contas");
      expect(r.saida).toContain("Mova");
    }
  });

  it("lista os tipos de vinculo que sobraram, sem inventar os ausentes", () => {
    const r = podeApagarDivisao({ contas: 0, contasFixas: 1, metas: 1, orcamentos: 0 });
    expect(r.podeApagar).toBe(false);
    if (!r.podeApagar) {
      expect(r.motivo).toContain("contas fixas");
      expect(r.motivo).toContain("metas");
      expect(r.motivo).not.toContain("orçamentos");
    }
  });

  it("so metas tambem impede", () => {
    expect(podeApagarDivisao({ ...divisaoLimpa, metas: 1 }).podeApagar).toBe(false);
  });
});

describe("@regression textoConfirmarExclusao", () => {
  it("pergunta sempre no mesmo formato", () => {
    expect(textoConfirmarExclusao({ tipo: "a meta", nome: "Eurotrip" })).toBe(
      'Apagar a meta "Eurotrip"?'
    );
  });

  it("acrescenta a consequencia quando ha uma", () => {
    const t = textoConfirmarExclusao({
      tipo: "a conta",
      nome: "Nubank",
      consequencia: "Os lançamentos dela continuam.",
    });
    expect(t).toContain('Apagar a conta "Nubank"?');
    expect(t).toContain("Os lançamentos dela continuam.");
  });
});
