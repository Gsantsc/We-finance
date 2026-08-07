import { describe, expect, it } from "vitest";
import {
  diasDeAtraso,
  origemDaConta,
  recorrenciaValeNoMes,
  resumirContas,
  statusDaConta,
  vencimentoNoMes,
} from "@/lib/contasAPagar";

describe("@regression statusDaConta", () => {
  const hoje = "2026-08-15";

  it("pago vence tudo, mesmo vencido ha meses", () => {
    expect(statusDaConta("2026-01-10", "2026-01-09", hoje)).toBe("pago");
    expect(statusDaConta("2026-12-10", "2026-08-01", hoje)).toBe("pago");
  });

  it("vencido e nao pago e' atrasado", () => {
    expect(statusDaConta("2026-08-14", null, hoje)).toBe("atrasado");
    expect(statusDaConta("2026-07-01", null, hoje)).toBe("atrasado");
  });

  it("no dia do vencimento ainda esta em aberto, nao atrasado", () => {
    expect(statusDaConta("2026-08-15", null, hoje)).toBe("em_aberto");
  });

  it("futuro esta em aberto", () => {
    expect(statusDaConta("2026-08-20", null, hoje)).toBe("em_aberto");
  });

  it("o status MUDA sozinho quando o dia passa - e' por isso que nao e' campo", () => {
    const venc = "2026-08-15";
    expect(statusDaConta(venc, null, "2026-08-14")).toBe("em_aberto");
    expect(statusDaConta(venc, null, "2026-08-15")).toBe("em_aberto");
    expect(statusDaConta(venc, null, "2026-08-16")).toBe("atrasado");
  });

  it("aceita data com hora sem se confundir", () => {
    expect(statusDaConta("2026-08-20T00:00:00Z", null, "2026-08-15T23:00:00Z")).toBe("em_aberto");
  });
});

describe("@regression diasDeAtraso", () => {
  it("conta os dias corridos desde o vencimento", () => {
    expect(diasDeAtraso("2026-08-10", "2026-08-15")).toBe(5);
    expect(diasDeAtraso("2026-08-14", "2026-08-15")).toBe(1);
  });

  it("nao inventa atraso para o que ainda vai vencer", () => {
    expect(diasDeAtraso("2026-08-20", "2026-08-15")).toBe(0);
    expect(diasDeAtraso("2026-08-15", "2026-08-15")).toBe(0);
  });

  it("atravessa mes e ano sem erro", () => {
    expect(diasDeAtraso("2026-12-30", "2027-01-05")).toBe(6);
    expect(diasDeAtraso("2026-01-31", "2026-03-01")).toBe(29); // 2026 nao e' bissexto
  });

  it("nao quebra na virada do horario de verao", () => {
    // Se as pontas nao fossem ancoradas ao meio-dia, um dos lados teria 23h e o
    // arredondamento cairia num dia a menos.
    expect(diasDeAtraso("2026-10-17", "2026-10-19")).toBe(2);
    expect(diasDeAtraso("2027-02-19", "2027-02-21")).toBe(2);
  });
});

describe("@regression vencimentoNoMes", () => {
  it("monta a data do vencimento no mes pedido", () => {
    expect(vencimentoNoMes("2026-08", 10)).toBe("2026-08-10");
    expect(vencimentoNoMes("2026-08", 5)).toBe("2026-08-05");
  });

  it("dia 31 em mes de 30 cai no ULTIMO dia, nao vira o mes", () => {
    expect(vencimentoNoMes("2026-04", 31)).toBe("2026-04-30");
    expect(vencimentoNoMes("2026-09", 31)).toBe("2026-09-30");
  });

  it("fevereiro respeita o ano bissexto", () => {
    expect(vencimentoNoMes("2026-02", 31)).toBe("2026-02-28");
    expect(vencimentoNoMes("2028-02", 30)).toBe("2028-02-29");
  });

  it("dia invalido e' contido nas bordas", () => {
    expect(vencimentoNoMes("2026-08", 0)).toBe("2026-08-01");
    expect(vencimentoNoMes("2026-08", -5)).toBe("2026-08-01");
    expect(vencimentoNoMes("2026-08", 99)).toBe("2026-08-31");
  });
});

describe("@regression recorrenciaValeNoMes", () => {
  it("sem inicio nem fim, vale sempre", () => {
    expect(recorrenciaValeNoMes("2026-08", null, null)).toBe(true);
    expect(recorrenciaValeNoMes("2019-01", null, null)).toBe(true);
  });

  it("nao vale antes de comecar", () => {
    expect(recorrenciaValeNoMes("2026-07", "2026-08", null)).toBe(false);
    expect(recorrenciaValeNoMes("2026-08", "2026-08", null)).toBe(true);
  });

  it("nao vale depois de acabar", () => {
    expect(recorrenciaValeNoMes("2026-09", null, "2026-08")).toBe(false);
    expect(recorrenciaValeNoMes("2026-08", null, "2026-08")).toBe(true);
  });

  it("respeita a janela nas duas pontas", () => {
    expect(recorrenciaValeNoMes("2026-06", "2026-07", "2026-09")).toBe(false);
    expect(recorrenciaValeNoMes("2026-08", "2026-07", "2026-09")).toBe(true);
    expect(recorrenciaValeNoMes("2026-10", "2026-07", "2026-09")).toBe(false);
  });

  it("desativada nao vale nem dentro da janela", () => {
    expect(recorrenciaValeNoMes("2026-08", null, null, false)).toBe(false);
  });
});

describe("@regression origemDaConta", () => {
  it("classifica pela procedencia, na ordem certa", () => {
    expect(origemDaConta({ billId: "b1" })).toBe("recorrente");
    expect(origemDaConta({ groupId: "g1", modoDoPlano: "fixed" })).toBe("emprestimo");
    expect(origemDaConta({ groupId: "g1", modoDoPlano: "split" })).toBe("parcela");
    expect(origemDaConta({})).toBe("avulsa");
  });

  it("recorrente ganha de parcela quando os dois existem", () => {
    expect(origemDaConta({ billId: "b1", groupId: "g1", modoDoPlano: "fixed" })).toBe("recorrente");
  });
});

describe("@regression resumirContas", () => {
  const itens = [
    { valor: 100, status: "pago" as const },
    { valor: 200, status: "em_aberto" as const },
    { valor: 50, status: "atrasado" as const },
    { valor: 25, status: "em_aberto" as const },
  ];

  it("as tres fatias somam o total - senao o resumo contradiz a si mesmo", () => {
    const r = resumirContas(itens);
    expect(r.total).toBe(375);
    expect(r.pago + r.emAberto + r.atrasado).toBe(r.total);
  });

  it("separa corretamente cada fatia", () => {
    const r = resumirContas(itens);
    expect(r).toMatchObject({ pago: 100, emAberto: 225, atrasado: 50, quantidade: 4 });
  });

  it("mes sem conta devolve zeros, nao NaN", () => {
    expect(resumirContas([])).toEqual({
      total: 0, pago: 0, emAberto: 0, atrasado: 0, quantidade: 0,
    });
  });
});
