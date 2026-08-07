import { describe, expect, it } from "vitest";
import { corDoFluxo, formatarDinheiro, valorComFluxo } from "@/lib/dinheiro";

// O espaco do pt-BR no Intl e' NBSP (U+00A0), nao espaco comum.
const brl = (s: string) => s.replace(/ /g, " ");

describe("@regression formatarDinheiro", () => {
  it("saida sai negativa, entrada sai positiva", () => {
    expect(brl(formatarDinheiro(715, "saida"))).toBe("−R$ 715,00");
    expect(brl(formatarDinheiro(715, "entrada"))).toBe("R$ 715,00");
  });

  it("NAO nega duas vezes: valor ja negativo com fluxo de saida continua com um sinal so", () => {
    // Este e' o bug que o fluxo explicito existe para impedir. As agregacoes
    // devolvem magnitude, mas se alguem passar o valor ja assinado o resultado
    // tem que ser o mesmo.
    expect(formatarDinheiro(-715, "saida")).toBe(formatarDinheiro(715, "saida"));
    expect(brl(formatarDinheiro(-715, "saida"))).toBe("−R$ 715,00");
  });

  it("entrada com valor negativo tambem nao inverte", () => {
    expect(brl(formatarDinheiro(-200, "entrada"))).toBe("R$ 200,00");
  });

  it("auto respeita o sinal do proprio numero (sobra, saldo, variacao)", () => {
    expect(brl(formatarDinheiro(-4560.32, "auto"))).toBe("−R$ 4.560,32");
    expect(brl(formatarDinheiro(4560.32, "auto"))).toBe("R$ 4.560,32");
  });

  it("neutro mostra a magnitude, sem sinal", () => {
    expect(brl(formatarDinheiro(-1000, "neutro"))).toBe("R$ 1.000,00");
  });

  it("zero nunca leva sinal - '−R$ 0,00' sugere um debito que nao existe", () => {
    expect(brl(formatarDinheiro(0, "saida"))).toBe("R$ 0,00");
    expect(brl(formatarDinheiro(-0, "saida"))).toBe("R$ 0,00");
    expect(formatarDinheiro(0, "saida")).not.toContain("−");
  });

  it("formata milhar em pt-BR", () => {
    expect(brl(formatarDinheiro(34320, "saida"))).toBe("−R$ 34.320,00");
    expect(brl(formatarDinheiro(1234.56, "entrada"))).toBe("R$ 1.234,56");
  });

  it("usa o menos tipografico, nao o hifen", () => {
    expect(formatarDinheiro(10, "saida").startsWith("−")).toBe(true);
    expect(formatarDinheiro(10, "saida").startsWith("-")).toBe(false);
  });
});

describe("@regression corDoFluxo", () => {
  it("saida e vermelha mesmo recebendo magnitude positiva", () => {
    expect(corDoFluxo(715, "saida")).toBe("text-clay");
  });

  it("entrada e verde", () => {
    expect(corDoFluxo(715, "entrada")).toBe("text-pine-600");
  });

  it("auto segue o sinal", () => {
    expect(corDoFluxo(-1, "auto")).toBe("text-clay");
    expect(corDoFluxo(1, "auto")).toBe("text-pine-600");
  });

  it("zero fica neutro, nao vermelho", () => {
    expect(corDoFluxo(0, "saida")).toBe("text-ink");
  });

  it("cor e sinal nunca discordam", () => {
    for (const v of [-500, -0.01, 0, 0.01, 500]) {
      for (const f of ["entrada", "saida", "auto", "neutro"] as const) {
        const texto = formatarDinheiro(v, f);
        const cor = corDoFluxo(v, f);
        const negativo = texto.startsWith("−");
        expect(negativo).toBe(cor === "text-clay");
      }
    }
  });
});

describe("@regression valorComFluxo", () => {
  it("normaliza para o sentido pedido", () => {
    expect(valorComFluxo(715, "saida")).toBe(-715);
    expect(valorComFluxo(-715, "saida")).toBe(-715);
    expect(valorComFluxo(-715, "entrada")).toBe(715);
    expect(valorComFluxo(-715, "auto")).toBe(-715);
  });

  it("e idempotente: aplicar duas vezes nao muda nada", () => {
    for (const f of ["entrada", "saida", "neutro"] as const) {
      const uma = valorComFluxo(715, f);
      expect(valorComFluxo(uma, f)).toBe(uma);
    }
  });
});
