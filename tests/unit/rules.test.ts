import { describe, expect, it } from "vitest";
import {
  addMonthKey,
  addMonths,
  billStatus,
  dataDeHojeSP,
  lerValorBR,
  mesDeHojeSP,
  budgetBarColor,
  goalPercent,
  installmentPlanCents,
  nextGoalAmount,
  percentUsado,
  repeatInstallmentCents,
  sortBills,
  splitInstallmentCents,
} from "@/lib/rules";

describe("@regression splitInstallmentCents", () => {
  it("soma das parcelas bate com o total (resto na ultima)", () => {
    const p = splitInstallmentCents(100000, 3);
    expect(p).toEqual([33333, 33333, 33334]);
    expect(p.reduce((s, x) => s + x, 0)).toBe(100000);
  });
  it("divisao exata", () => {
    expect(splitInstallmentCents(100000, 4)).toEqual([25000, 25000, 25000, 25000]);
  });
  it("uma parcela = o total", () => {
    expect(splitInstallmentCents(4599, 1)).toEqual([4599]);
  });
});

describe("@regression repeatInstallmentCents", () => {
  it("repete o valor mensal informado em todas as parcelas", () => {
    const p = repeatInstallmentCents(71500, 48);
    expect(p).toHaveLength(48);
    expect(p.every((x) => x === 71500)).toBe(true);
  });
});

describe("@regression installmentPlanCents", () => {
  it("modo fixed nao divide: emprestimo de 715 em 48x = 48 parcelas de 715", () => {
    const p = installmentPlanCents(71500, 48, "fixed");
    expect(p).toHaveLength(48);
    expect(p.every((x) => x === 71500)).toBe(true);
    expect(p.reduce((s, x) => s + x, 0)).toBe(71500 * 48);
  });

  it("modo split divide o total: compra de 1200 em 12x = 12 parcelas de 100", () => {
    const p = installmentPlanCents(120000, 12, "split");
    expect(p).toHaveLength(12);
    expect(p.every((x) => x === 10000)).toBe(true);
    expect(p.reduce((s, x) => s + x, 0)).toBe(120000);
  });

  it("modo split joga o resto na ultima parcela", () => {
    expect(installmentPlanCents(100000, 3, "split")).toEqual([33333, 33333, 33334]);
  });

  it("os dois modos divergem para o mesmo valor (e' esse o bug que separa)", () => {
    const fixo = installmentPlanCents(71500, 48, "fixed");
    const dividido = installmentPlanCents(71500, 48, "split");
    expect(fixo[0]).toBe(71500);
    expect(dividido[0]).toBe(1489);
  });
});

describe("@regression addMonths", () => {
  it("soma meses mantendo o dia", () => {
    expect(addMonths("2026-01-10", 1)).toBe("2026-02-10");
    expect(addMonths("2026-01-10", 12)).toBe("2027-01-10");
  });
  it("vira o ano", () => {
    expect(addMonths("2026-11-05", 3)).toBe("2027-02-05");
  });
  it("clampa o dia para o fim do mes mais curto", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("@regression lerValorBR", () => {
  it("le a grafia brasileira com milhar e decimal", () => {
    expect(lerValorBR("1.500,50")).toBe(1500.5);
    expect(lerValorBR("10.000")).toBe(10000);
    expect(lerValorBR("1500,50")).toBe(1500.5);
  });

  it("parseFloat sozinho erraria esse caso - e' o bug que motivou a funcao", () => {
    expect(parseFloat("1.500,50".replace(",", "."))).toBe(1.5);
    expect(lerValorBR("1.500,50")).toBe(1500.5);
  });

  it("aceita negativo, R$ e espacos", () => {
    expect(lerValorBR("-20")).toBe(-20);
    expect(lerValorBR(" R$ 2.000,00 ")).toBe(2000);
    expect(lerValorBR("-1.234,56")).toBe(-1234.56);
  });

  it("ponto em grupos de 3 e' milhar; fora disso e' decimal", () => {
    expect(lerValorBR("10.000")).toBe(10000);
    expect(lerValorBR("1.234.567")).toBe(1234567);
    expect(lerValorBR("1500.50")).toBe(1500.5);
    expect(lerValorBR("0.75")).toBe(0.75);
  });

  it("devolve null no que nao e' numero, em vez de NaN silencioso", () => {
    expect(lerValorBR("abc")).toBeNull();
    expect(lerValorBR("")).toBeNull();
    expect(lerValorBR("1,2,3")).toBeNull();
  });
});

describe("@regression fuso de competencia (America/Sao_Paulo)", () => {
  it("22h de 31/07 em BRT ainda e' 31/07, nao 01/08", () => {
    // 2026-08-01T01:00:00Z = 31/07/2026 22:00 em Sao Paulo (UTC-3).
    const instante = new Date("2026-08-01T01:00:00Z");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-08-01"); // o bug
    expect(dataDeHojeSP(instante)).toBe("2026-07-31");
    expect(mesDeHojeSP(instante)).toBe("2026-07");
  });

  it("meio-dia bate nos dois jeitos", () => {
    const instante = new Date("2026-07-15T15:00:00Z");
    expect(dataDeHojeSP(instante)).toBe("2026-07-15");
  });

  it("00h30 UTC ainda e' o dia anterior no Brasil", () => {
    expect(dataDeHojeSP(new Date("2026-03-10T00:30:00Z"))).toBe("2026-03-09");
  });

  it("sempre devolve YYYY-MM-DD", () => {
    expect(dataDeHojeSP()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mesDeHojeSP()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("@regression addMonthKey", () => {
  it("anda para frente e para tras dentro do ano", () => {
    expect(addMonthKey("2026-07", 1)).toBe("2026-08");
    expect(addMonthKey("2026-07", -1)).toBe("2026-06");
  });

  it("vira o ano nas duas direcoes", () => {
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("salta varios meses", () => {
    expect(addMonthKey("2026-01", 25)).toBe("2028-02");
    expect(addMonthKey("2026-03", -15)).toBe("2024-12");
  });

  it("ida e volta e' identidade", () => {
    for (const m of ["2026-01", "2026-12", "2027-06"]) {
      expect(addMonthKey(addMonthKey(m, 7), -7)).toBe(m);
    }
  });

  it("aceita uma data completa e devolve so a chave do mes", () => {
    expect(addMonthKey("2026-11-30", 2)).toBe("2027-01");
  });
});

describe("@regression billStatus", () => {
  it("marca como vencida quando o dia de hoje passou do vencimento e nao foi paga", () => {
    const hoje = new Date(2026, 6, 20); // 20/07/2026
    const status = billStatus(10, null, hoje);
    expect(status.vencido).toBe(true);
    expect(status.pagoEsteMes).toBe(false);
    expect(status.diasAteVencer).toBe(10 - 20);
  });

  it("nao marca como vencida no dia exato do vencimento", () => {
    const hoje = new Date(2026, 6, 10);
    const status = billStatus(10, null, hoje);
    expect(status.vencido).toBe(false);
    expect(status.diasAteVencer).toBe(0);
  });

  it("ajusta dueDay=31 para o ultimo dia de fevereiro (nao bissexto)", () => {
    const hoje = new Date(2027, 1, 15); // fevereiro/2027, 28 dias
    const status = billStatus(31, null, hoje);
    expect(status.vencimentoISO).toBe("2027-02-28");
    expect(status.diasAteVencer).toBe(28 - 15);
  });

  it("ajusta dueDay=31 para o ultimo dia de fevereiro bissexto", () => {
    const hoje = new Date(2028, 1, 15); // fevereiro/2028, 29 dias
    const status = billStatus(31, null, hoje);
    expect(status.vencimentoISO).toBe("2028-02-29");
  });

  it("considera paga quando o ultimo pagamento caiu no mes/ano atual", () => {
    const hoje = new Date(2026, 6, 25);
    const status = billStatus(10, new Date(2026, 6, 5).toISOString(), hoje);
    expect(status.pagoEsteMes).toBe(true);
    expect(status.vencido).toBe(false);
    expect(status.diasAteVencer).toBeNull();
  });

  it("nao considera paga se o pagamento foi no mes anterior", () => {
    const hoje = new Date(2026, 6, 5);
    const status = billStatus(10, new Date(2026, 5, 28).toISOString(), hoje);
    expect(status.pagoEsteMes).toBe(false);
  });
});

describe("@regression sortBills", () => {
  const bill = (over: Partial<{ vencido: boolean; pagoEsteMes: boolean; dueDay: number }>) => ({
    vencido: false,
    pagoEsteMes: false,
    dueDay: 15,
    ...over,
  });

  it("coloca vencidas primeiro, pagas por ultimo, e ordena por dia dentro do grupo", () => {
    const paga = bill({ pagoEsteMes: true, dueDay: 1 });
    const pendenteCedo = bill({ dueDay: 5 });
    const pendenteTarde = bill({ dueDay: 20 });
    const vencida = bill({ vencido: true, dueDay: 3 });

    const ordenadas = sortBills([paga, pendenteTarde, vencida, pendenteCedo]);

    expect(ordenadas).toEqual([vencida, pendenteCedo, pendenteTarde, paga]);
  });

  it("nao muda o array original", () => {
    const original = [bill({ dueDay: 20 }), bill({ dueDay: 5 })];
    const copia = [...original];
    sortBills(original);
    expect(original).toEqual(copia);
  });
});

describe("@regression nextGoalAmount", () => {
  it("soma o deposito ao valor atual", () => {
    expect(nextGoalAmount(100, { deposito: 50 })).toBe(150);
  });

  it("zera em vez de ficar negativo quando o deposito ultrapassa o saldo", () => {
    expect(nextGoalAmount(100, { deposito: -150 })).toBe(0);
  });

  it("substitui direto quando vem currentAmount (sem deposito)", () => {
    expect(nextGoalAmount(100, { currentAmount: 300 })).toBe(300);
  });

  it("mantem o valor atual quando nao vem nem deposito nem currentAmount", () => {
    expect(nextGoalAmount(100, {})).toBe(100);
  });

  it("deposito tem prioridade sobre currentAmount se os dois vierem", () => {
    expect(nextGoalAmount(100, { deposito: 10, currentAmount: 999 })).toBe(110);
  });
});

describe("@regression goalPercent", () => {
  it("calcula o percentual e arredonda", () => {
    expect(goalPercent(33, 100)).toBe(33);
  });

  it("nao passa de 100 mesmo com valor atual acima da meta", () => {
    expect(goalPercent(150, 100)).toBe(100);
  });

  it("retorna 0 quando o alvo e zero (evita divisao por zero)", () => {
    expect(goalPercent(50, 0)).toBe(0);
  });
});

describe("@regression percentUsado", () => {
  it("calcula o percentual gasto do orcamento", () => {
    expect(percentUsado(80, 100)).toBe(80);
  });

  it("retorna 0 quando o orcamento e zero", () => {
    expect(percentUsado(50, 0)).toBe(0);
  });

  it("pode passar de 100 quando estoura o orcamento", () => {
    expect(percentUsado(150, 100)).toBe(150);
  });
});

describe("@regression budgetBarColor", () => {
  it("verde ate 80%", () => {
    expect(budgetBarColor(0)).toBe("emerald");
    expect(budgetBarColor(80)).toBe("emerald");
  });

  it("ambar acima de 80% ate 100%", () => {
    expect(budgetBarColor(81)).toBe("amber");
    expect(budgetBarColor(100)).toBe("amber");
  });

  it("vermelho acima de 100%", () => {
    expect(budgetBarColor(101)).toBe("red");
  });
});
