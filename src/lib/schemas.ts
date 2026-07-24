// Schemas de validacao (zod) usados pelas rotas de API.
// Ficam separados para as telas e as rotas falarem da mesma forma sobre
// o que e um valor valido.

import { z } from "zod";

export const entityTypeSchema = z.enum(["CASA", "PESSOAL", "PJ"]);
export const accountTypeSchema = z.enum([
  "CORRENTE",
  "POUPANCA",
  "CARTAO",
  "INVESTIMENTO",
  "DINHEIRO",
  "OUTRO",
]);

const id = z.string().min(1, "obrigatorio");
const nome = z.string().trim().min(1, "obrigatorio").max(120, "muito longo");
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use o formato #rrggbb");
const valor = z
  .number({ invalid_type_error: "precisa ser um numero" })
  .finite("precisa ser um numero");
const data = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "data invalida");

// ---------- Entidades ----------

export const entityCreateSchema = z.object({
  name: nome,
  type: entityTypeSchema,
  ownerId: id.nullish(),
  color: cor.optional(),
});

export const entityUpdateSchema = z.object({
  id,
  name: nome.optional(),
  type: entityTypeSchema.optional(),
  ownerId: id.nullish(),
  color: cor.optional(),
  archived: z.boolean().optional(),
});

// ---------- Contas ----------

export const accountCreateSchema = z.object({
  name: nome,
  type: accountTypeSchema,
  entityId: id.nullish(),
  balance: valor.optional(),
  institution: z.string().trim().max(120).nullish(),
});

export const accountUpdateSchema = z.object({
  id,
  name: nome.optional(),
  type: accountTypeSchema.optional(),
  entityId: id.nullish(),
  balance: valor.optional(),
  archived: z.boolean().optional(),
});

// ---------- Transacoes ----------

export const transactionCreateSchema = z.object({
  accountId: id,
  description: nome,
  amount: valor,
  date: data,
  categoryId: id.nullish(),
  notes: z.string().trim().max(500).nullish(),
});

export const transactionUpdateSchema = z.object({
  id,
  description: nome.optional(),
  amount: valor.optional(),
  date: data.optional(),
  categoryId: id.nullish(),
  notes: z.string().trim().max(500).nullish(),
});

const mes = z.number().int().min(1, "mes de 1 a 12").max(12, "mes de 1 a 12");
const ano = z.number().int().min(2000).max(2100);
const valorPositivo = valor.refine((v) => v >= 0, "nao pode ser negativo");

// ---------- Orcamentos (budgets) ----------

export const budgetUpsertSchema = z.object({
  entityId: id,
  categoryId: id,
  month: mes,
  year: ano,
  amount: valorPositivo,
});

// ---------- Metas (goals) ----------

export const goalCreateSchema = z.object({
  entityId: id,
  name: nome,
  targetAmount: valorPositivo,
  currentAmount: valorPositivo.optional(),
  targetDate: data.nullish(),
});

export const goalUpdateSchema = z.object({
  id,
  name: nome.optional(),
  targetAmount: valorPositivo.optional(),
  currentAmount: valorPositivo.optional(),
  // deposito soma ao valor atual (pode ser negativo para corrigir).
  deposito: valor.optional(),
  targetDate: data.nullish(),
});

// ---------- Contas a pagar (bills) ----------

const dia = z.number().int().min(1, "dia de 1 a 31").max(31, "dia de 1 a 31");

export const billCreateSchema = z.object({
  entityId: id,
  name: nome,
  amount: valorPositivo,
  dueDay: dia,
  recurring: z.boolean().optional(),
});

export const billUpdateSchema = z.object({
  id,
  name: nome.optional(),
  amount: valorPositivo.optional(),
  dueDay: dia.optional(),
  recurring: z.boolean().optional(),
  // pagar=true marca como pago agora; pagar=false desmarca.
  pagar: z.boolean().optional(),
});
