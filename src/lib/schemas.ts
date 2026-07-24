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
