// Schemas de validacao (zod) usados pelas rotas de API.
// Ficam separados para as telas e as rotas falarem da mesma forma sobre
// o que e um valor valido.

import { z } from "zod";

export const entityTypeSchema = z.enum(["CASA", "PESSOAL", "PJ"]);
// Espelha o CHECK accounts_type_check (migracao 0003). Mexer aqui sem mexer la
// (ou o contrario) da erro so na hora do INSERT.
export const accountTypeSchema = z.enum([
  "CORRENTE",
  "POUPANCA",
  "CARTAO",
  "INVESTIMENTO",
  "DINHEIRO",
  "VALE_ALIMENTACAO", // VA
  "VALE_REFEICAO", // VR
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

// ---------- Cadastro ----------

// Senha inicial de todo cadastro novo; o primeiro login obriga a troca.
export const SENHA_PADRAO = "Muda@123";

const email = z.string().trim().toLowerCase().email("email invalido");

// Conta "CASAL" cadastra duas pessoas de uma vez (ambas recebem o email de
// confirmacao); "UNICA" cadastra so o titular. Ninguem escolhe senha aqui -
// todo mundo nasce com a senha padrao e troca no primeiro login.
export const registerSchema = z
  .object({
    tipo: z.enum(["CASAL", "UNICA"]),
    name: nome,
    email,
    partnerName: nome.optional(),
    partnerEmail: email.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "CASAL") {
      if (!v.partnerName)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partnerName"], message: "obrigatorio para conta casal" });
      if (!v.partnerEmail)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partnerEmail"], message: "obrigatorio para conta casal" });
      if (v.partnerEmail && v.partnerEmail === v.email)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partnerEmail"], message: "use um email diferente do titular" });
    }
  });

// Senha forte na troca: minimo 8, com letra maiuscula, minuscula e numero.
export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "minimo 8 caracteres")
    .regex(/[a-z]/, "precisa de letra minuscula")
    .regex(/[A-Z]/, "precisa de letra maiuscula")
    .regex(/[0-9]/, "precisa de numero"),
});

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

export const installmentModeSchema = z.enum(["split", "fixed"]);

export const transactionCreateSchema = z.object({
  accountId: id,
  description: nome,
  amount: valor,
  date: data,
  categoryId: id.nullish(),
  notes: z.string().trim().max(500).nullish(),
  // >1 cria um parcelamento; ausente/1 = a vista. O "installmentMode" diz como
  // ler o "amount": "split" (compra em Nx) = amount e' o TOTAL, dividido nas n
  // parcelas; "fixed" (parcela fixa / emprestimo) = amount e' o valor de CADA
  // parcela e o total e' amount x n. Ausente = "fixed".
  installments: z.number().int().min(1).max(360).optional(),
  installmentMode: installmentModeSchema.optional(),
});

// ---------- Regras de categorizacao ----------

export const ruleCreateSchema = z.object({
  matchType: z.enum(["contains", "starts_with", "regex"]),
  pattern: z.string().trim().min(1, "informe o texto").max(200),
  categoryId: id,
  priority: z.number().int().min(0).max(1000).optional(),
});

export const transactionUpdateSchema = z.object({
  id,
  accountId: id.optional(),
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
  monthlyAmount: valorPositivo.optional(),
  targetDate: data.nullish(),
});

export const goalUpdateSchema = z.object({
  id,
  name: nome.optional(),
  targetAmount: valorPositivo.optional(),
  currentAmount: valorPositivo.optional(),
  monthlyAmount: valorPositivo.optional(),
  // deposito soma ao valor atual (pode ser negativo para corrigir).
  deposito: valor.optional(),
  targetDate: data.nullish(),
});

// Aporte de meta: valor pode ser negativo (retirada/correcao), mas nunca zero.
export const goalContributionCreateSchema = z.object({
  goalId: id,
  amount: valor.refine((v) => v !== 0, "informe um valor diferente de zero"),
  date: data,
  note: z.string().trim().max(200).nullish(),
});

// ---------- Import de planilha (CSV) ----------

const importRowSchema = z.object({
  date: data,
  description: z.string().trim().min(1, "descricao vazia").max(300),
  amount: valor.refine((v) => v !== 0, "valor zero"),
  categoryName: z.string().trim().max(120).nullish(),
});

export const importSchema = z.object({
  accountId: id,
  filename: z.string().trim().max(200).nullish(),
  rows: z.array(importRowSchema).min(1, "nenhuma linha para importar").max(5000, "no maximo 5000 linhas por vez"),
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
