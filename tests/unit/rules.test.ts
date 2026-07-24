import { describe, expect, it } from "vitest";
import {
  billStatus,
  budgetBarColor,
  goalPercent,
  nextGoalAmount,
  percentUsado,
  sortBills,
} from "@/lib/rules";

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
