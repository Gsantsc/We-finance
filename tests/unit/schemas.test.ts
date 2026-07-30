import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/schemas";

describe("@regression recuperacao de senha", () => {
  const tokenOk = "a".repeat(64);

  it("aceita um pedido valido", () => {
    expect(forgotPasswordSchema.safeParse({ email: "Ana@Exemplo.COM " }).success).toBe(true);
  });

  it("normaliza o email (trim + minusculas) para casar com o cadastro", () => {
    const r = forgotPasswordSchema.parse({ email: "  Ana@Exemplo.COM " });
    expect(r.email).toBe("ana@exemplo.com");
  });

  it("recusa email invalido", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nao-e-email" }).success).toBe(false);
  });

  it("token precisa ter o formato exato de 64 hex", () => {
    const senha = "Senha123";
    expect(resetPasswordSchema.safeParse({ token: tokenOk, newPassword: senha }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "curto", newPassword: senha }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "z".repeat(64), newPassword: senha }).success).toBe(false);
    // Nao deixa passar tentativa de injecao pelo token.
    expect(resetPasswordSchema.safeParse({ token: "' OR 1=1 --", newPassword: senha }).success).toBe(false);
  });

  it("exige senha forte na redefinicao", () => {
    const fracas = ["curta1A", "semmaiuscula1", "SEMMINUSCULA1", "SemNumeroAqui"];
    for (const p of fracas) {
      expect(resetPasswordSchema.safeParse({ token: tokenOk, newPassword: p }).success).toBe(false);
    }
    expect(resetPasswordSchema.safeParse({ token: tokenOk, newPassword: "Senha123" }).success).toBe(true);
  });
});
import {
  billCreateSchema,
  budgetUpsertSchema,
  goalCreateSchema,
  goalUpdateSchema,
  transactionUpdateSchema,
} from "@/lib/schemas";

const entityId = "entity-1";
const categoryId = "cat-1";

describe("@regression billCreateSchema", () => {
  const base = { entityId, name: "Aluguel", amount: 100, dueDay: 15 };

  it("aceita dueDay nos limites 1 e 31", () => {
    expect(billCreateSchema.safeParse({ ...base, dueDay: 1 }).success).toBe(true);
    expect(billCreateSchema.safeParse({ ...base, dueDay: 31 }).success).toBe(true);
  });

  it("rejeita dueDay fora dos limites", () => {
    expect(billCreateSchema.safeParse({ ...base, dueDay: 0 }).success).toBe(false);
    expect(billCreateSchema.safeParse({ ...base, dueDay: 32 }).success).toBe(false);
  });

  it("rejeita amount negativo", () => {
    expect(billCreateSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
  });

  it("rejeita amount nao finito (NaN/Infinity)", () => {
    expect(billCreateSchema.safeParse({ ...base, amount: NaN }).success).toBe(false);
    expect(billCreateSchema.safeParse({ ...base, amount: Infinity }).success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    expect(billCreateSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
});

describe("@regression budgetUpsertSchema", () => {
  const base = { entityId, categoryId, month: 6, year: 2026, amount: 500 };

  it("aceita mes nos limites 1 e 12", () => {
    expect(budgetUpsertSchema.safeParse({ ...base, month: 1 }).success).toBe(true);
    expect(budgetUpsertSchema.safeParse({ ...base, month: 12 }).success).toBe(true);
  });

  it("rejeita mes fora dos limites", () => {
    expect(budgetUpsertSchema.safeParse({ ...base, month: 0 }).success).toBe(false);
    expect(budgetUpsertSchema.safeParse({ ...base, month: 13 }).success).toBe(false);
  });

  it("rejeita ano fora do range 2000-2100", () => {
    expect(budgetUpsertSchema.safeParse({ ...base, year: 1999 }).success).toBe(false);
    expect(budgetUpsertSchema.safeParse({ ...base, year: 2101 }).success).toBe(false);
  });

  it("aceita ano nos limites 2000 e 2100", () => {
    expect(budgetUpsertSchema.safeParse({ ...base, year: 2000 }).success).toBe(true);
    expect(budgetUpsertSchema.safeParse({ ...base, year: 2100 }).success).toBe(true);
  });

  it("rejeita amount negativo", () => {
    expect(budgetUpsertSchema.safeParse({ ...base, amount: -0.01 }).success).toBe(false);
  });
});

describe("@regression goalCreateSchema", () => {
  it("rejeita targetAmount negativo", () => {
    const r = goalCreateSchema.safeParse({ entityId, name: "Viagem", targetAmount: -1 });
    expect(r.success).toBe(false);
  });

  it("aceita sem currentAmount nem targetDate (opcionais)", () => {
    const r = goalCreateSchema.safeParse({ entityId, name: "Viagem", targetAmount: 1000 });
    expect(r.success).toBe(true);
  });

  it("aceita monthlyAmount positivo opcional", () => {
    const r = goalCreateSchema.safeParse({
      entityId,
      name: "Reserva",
      targetAmount: 5000,
      monthlyAmount: 300,
    });
    expect(r.success).toBe(true);
  });
});

describe("@regression goalUpdateSchema", () => {
  it("aceita deposito negativo (correcao de saldo)", () => {
    const r = goalUpdateSchema.safeParse({ id: "goal-1", deposito: -50 });
    expect(r.success).toBe(true);
  });

  it("rejeita deposito nao finito", () => {
    const r = goalUpdateSchema.safeParse({ id: "goal-1", deposito: NaN });
    expect(r.success).toBe(false);
  });

  it("exige id", () => {
    const r = goalUpdateSchema.safeParse({ deposito: 10 });
    expect(r.success).toBe(false);
  });
});

describe("@regression transactionUpdateSchema", () => {
  it("aceita troca de conta no lancamento", () => {
    const r = transactionUpdateSchema.safeParse({ id: "tx-1", accountId: "acc-2" });
    expect(r.success).toBe(true);
  });
});
