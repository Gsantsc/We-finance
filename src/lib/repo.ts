// Funcoes de acesso ao banco (Postgres/Supabase). Retornam objetos ja no
// formato que as telas esperam (camelCase, com entity/category/owner
// aninhados quando faz sentido) - as colunas no banco sao snake_case, entao
// as funcoes "shape*" fazem essa ponte.
//
// Isolamento multi-tenant: entities/accounts/budgets/goals/bills pertencem a
// um household (household_id). Toda leitura/escrita dessas tabelas exige o
// householdId de quem esta autenticado e as funcoes de update/delete conferem
// que o registro pertence aquele household antes de mexer.
//
// DINHEIRO: guardado em CENTAVOS (bigint) no banco - somar float acumula erro.
// A API/UI continua falando em REAIS (number); toCents/toReais fazem a ponte
// na borda deste modulo, entao as telas nao precisam saber de centavos.

import { randomBytes, createHash } from "node:crypto";
import { sql, newId, nowIso } from "./db";
import type postgres from "postgres";
import type { InstallmentMode } from "./rules";
import {
  addMonthKey,
  addMonths,
  billStatus,
  dataDeHojeSP,
  goalPercent,
  installmentPlanCents,
  mesDeHojeSP,
  nextGoalAmount,
  percentUsado,
} from "./rules";
import { ApiError } from "./errors";

export type EntityType = "CASA" | "PESSOAL" | "PJ";
export type AccountType =
  | "CORRENTE"
  | "POUPANCA"
  | "CARTAO"
  | "INVESTIMENTO"
  | "DINHEIRO"
  | "VALE_ALIMENTACAO"
  | "VALE_REFEICAO"
  | "OUTRO";

type Row = Record<string, any>;

// Reais (com casas) -> centavos inteiros. postgres.js devolve bigint como
// string, por isso toReais normaliza com Number antes de dividir.
function toCents(reais: number): number {
  return Math.round(reais * 100);
}
function toReais(cents: number | bigint | string | null | undefined): number {
  return Number(cents ?? 0) / 100;
}
// Descricao normalizada para o fingerprint de dedup do import.
function normalizeDesc(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Data de competencia guardada como "YYYY-MM-DD" (dia, sem hora/fuso). Guardar
// o instante ISO fazia a data aparecer um dia antes em fuso atras do UTC.
function toDateOnly(s: string): string {
  const iso = String(s).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

// Agrupa varias escritas numa transacao so: ou tudo grava, ou nada grava.
function inTransaction<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}

// ---------- Users ----------

function shapeUser(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    emailVerifiedAt: row.email_verified_at,
    mustChangePassword: row.must_change_password,
  };
}

export async function getUserByEmail(email: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM users WHERE email = ${email}`;
  return row ? shapeUser(row) : undefined;
}

export async function getUserById(id: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM users WHERE id = ${id}`;
  return row ? shapeUser(row) : undefined;
}

// Cria/atualiza um usuario ja confiavel (usado pelo "npm run seed", rodado
// por quem administra o deploy) - verificado desde a criacao.
export async function upsertUser(u: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<Row> {
  const existing = await getUserByEmail(u.email);
  if (existing) {
    await sql`UPDATE users SET name = ${u.name}, password_hash = ${u.passwordHash} WHERE id = ${existing.id}`;
    return (await getUserById(existing.id))!;
  }
  const id = newId();
  const ts = nowIso();
  await sql`INSERT INTO users (id, name, email, password_hash, created_at, email_verified_at)
    VALUES (${id}, ${u.name}, ${u.email}, ${u.passwordHash}, ${ts}, ${ts})`;
  return (await getUserById(id))!;
}

// Cadastro pela tela /registrar: nasce com a senha padrao, obrigado a trocar
// no primeiro login, e sem email verificado ate clicar no link.
export async function createPendingUser(u: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<Row> {
  const existing = await getUserByEmail(u.email);
  if (existing) throw new ApiError("Email ja cadastrado", 409);
  const id = newId();
  await sql`INSERT INTO users (id, name, email, password_hash, created_at, must_change_password)
    VALUES (${id}, ${u.name}, ${u.email}, ${u.passwordHash}, ${nowIso()}, true)`;
  return (await getUserById(id))!;
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash}, must_change_password = false WHERE id = ${userId}`;
}

// ---------- Verificacao de email ----------

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (${newId()}, ${userId}, ${tokenHash}, ${expiresAt}, ${nowIso()})`;
  return rawToken;
}

export async function consumeEmailVerificationToken(
  rawToken: string,
  opts: { cascata: boolean }
): Promise<Row[] | null> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return inTransaction(async (tx) => {
    const [row] = await tx`SELECT * FROM email_verification_tokens WHERE token_hash = ${tokenHash}`;
    if (!row) return null;

    await tx`DELETE FROM email_verification_tokens WHERE id = ${row.id}`;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;

    const ts = nowIso();
    const householdId = opts.cascata ? await getHouseholdIdForUser(row.user_id) : null;
    if (!householdId) {
      await tx`UPDATE users SET email_verified_at = ${ts} WHERE id = ${row.user_id} AND email_verified_at IS NULL`;
      const user = await getUserById(row.user_id);
      return user ? [user] : null;
    }

    const membros = await tx`
      SELECT u.* FROM users u
      JOIN household_members hm ON hm.user_id = u.id
      WHERE hm.household_id = ${householdId}
    `;
    const pendentes = membros.filter((m) => !m.email_verified_at);
    for (const m of pendentes) {
      await tx`UPDATE users SET email_verified_at = ${ts} WHERE id = ${m.id}`;
    }
    if (pendentes.length > 0) return pendentes.map(shapeUser);

    const user = await getUserById(row.user_id);
    return user ? [user] : null;
  });
}

// ---------- Households ----------

function shapeHousehold(row: Row): Row {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, createdAt: row.created_at };
}

function generateInviteCode(): string {
  return randomBytes(4).toString("hex");
}

export async function getHouseholdIdForUser(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT household_id FROM household_members WHERE user_id = ${userId} LIMIT 1`;
  return row?.household_id ?? null;
}

export async function getHousehold(id: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM households WHERE id = ${id}`;
  return row ? shapeHousehold(row) : undefined;
}

export async function findHouseholdByInviteCode(code: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM households WHERE invite_code = ${code}`;
  return row ? shapeHousehold(row) : undefined;
}

export async function createHousehold(name: string): Promise<Row> {
  const id = newId();
  let code = generateInviteCode();
  while ((await sql`SELECT 1 FROM households WHERE invite_code = ${code}`).length > 0) {
    code = generateInviteCode();
  }
  await sql`INSERT INTO households (id, name, invite_code, created_at) VALUES (${id}, ${name}, ${code}, ${nowIso()})`;
  return (await getHousehold(id))!;
}

// Quem mora na casa. Usado para escolher o dono de uma entidade (entities.owner_id
// e' o que separa "meu dinheiro" de "nosso dinheiro" no dashboard).
export async function listHouseholdMembers(householdId: string): Promise<Row[]> {
  const rows = await sql`
    SELECT u.id, u.name, hm.role, hm.income_share_bps
    FROM users u
    JOIN household_members hm ON hm.user_id = u.id
    WHERE hm.household_id = ${householdId}
    ORDER BY hm.joined_at ASC
  `;
  // Sem email: o unico consumidor (seletor de dono em /entidades) usa id e nome,
  // e endpoint de listagem nao precisa devolver dado pessoal que ninguem le.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    incomeShareBps: r.income_share_bps,
  }));
}

export async function addHouseholdMember(householdId: string, userId: string): Promise<void> {
  await sql`INSERT INTO household_members (household_id, user_id, joined_at)
    VALUES (${householdId}, ${userId}, ${nowIso()}) ON CONFLICT DO NOTHING`;
}

// ---------- Entities ----------

async function shapeEntity(row: Row): Promise<Row> {
  const owner = row.owner_id ? await getUserById(row.owner_id) : null;
  const accountRows = await sql`SELECT * FROM accounts WHERE entity_id = ${row.id} AND archived = false`;
  const resumo = { id: row.id, name: row.name, type: row.type, color: row.color };
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    ownerId: row.owner_id,
    color: row.color,
    archived: row.archived,
    createdAt: row.created_at,
    owner: owner ? { id: owner.id, name: owner.name } : null,
    accounts: await Promise.all(accountRows.map((a) => shapeAccount(a, resumo))),
  };
}

export async function listEntities(householdId: string): Promise<Row[]> {
  const rows = await sql`SELECT * FROM entities WHERE household_id = ${householdId} AND archived = false ORDER BY created_at ASC`;
  return Promise.all(rows.map(shapeEntity));
}

export async function findEntityByName(householdId: string, name: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM entities WHERE household_id = ${householdId} AND name = ${name}`;
  return row;
}

async function assertUserInHousehold(householdId: string, userId: string): Promise<void> {
  const [row] = await sql`SELECT 1 FROM household_members WHERE household_id = ${householdId} AND user_id = ${userId}`;
  if (!row) throw new ApiError("Usuario nao encontrado nesta casa", 404);
}

export async function createEntity(householdId: string, e: {
  name: string;
  type: EntityType;
  ownerId?: string | null;
  color?: string;
}): Promise<Row> {
  if (e.ownerId) await assertUserInHousehold(householdId, e.ownerId);
  const id = newId();
  await sql`INSERT INTO entities (id, household_id, name, type, owner_id, color, archived, created_at)
    VALUES (${id}, ${householdId}, ${e.name}, ${e.type}, ${e.ownerId ?? null}, ${e.color ?? "#6366f1"}, false, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM entities WHERE id = ${id}`;
  return shapeEntity(row);
}

export async function updateEntity(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM entities WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Entidade nao encontrada", 404);
  if (patch.ownerId) await assertUserInHousehold(householdId, patch.ownerId);
  const next = {
    name: patch.name ?? cur.name,
    type: patch.type ?? cur.type,
    ownerId: patch.ownerId === undefined ? cur.owner_id : patch.ownerId,
    color: patch.color ?? cur.color,
    archived: patch.archived === undefined ? cur.archived : !!patch.archived,
  };
  await sql`UPDATE entities SET name = ${next.name}, type = ${next.type}, owner_id = ${next.ownerId}, color = ${next.color}, archived = ${next.archived} WHERE id = ${id}`;
  const [row] = await sql`SELECT * FROM entities WHERE id = ${id}`;
  return shapeEntity(row);
}

// ---------- Accounts ----------

async function shapeAccount(row: Row, knownEntity?: Row | null): Promise<Row> {
  let entity = knownEntity;
  if (entity === undefined) {
    if (row.entity_id) {
      const [e] = await sql`SELECT id, name, type, color FROM entities WHERE id = ${row.entity_id}`;
      entity = e ?? null;
    } else {
      entity = null;
    }
  }
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    type: row.type,
    institution: row.institution,
    balance: toReais(row.balance),
    currency: row.currency,
    pluggyItemId: row.pluggy_item_id,
    pluggyAccountId: row.pluggy_account_id,
    isManual: row.is_manual,
    archived: row.archived,
    entity: entity || null,
  };
}

async function assertEntityInHousehold(householdId: string, entityId: string): Promise<void> {
  const [row] = await sql`SELECT id FROM entities WHERE id = ${entityId} AND household_id = ${householdId}`;
  if (!row) throw new ApiError("Entidade nao encontrada", 404);
}

export async function listAccounts(householdId: string): Promise<Row[]> {
  const rows = await sql`SELECT * FROM accounts WHERE household_id = ${householdId} AND archived = false ORDER BY created_at ASC`;
  return Promise.all(rows.map((r) => shapeAccount(r)));
}

export async function createAccount(householdId: string, a: {
  name: string;
  type: AccountType;
  entityId?: string | null;
  balance?: number;
  institution?: string | null;
}): Promise<Row> {
  if (a.entityId) await assertEntityInHousehold(householdId, a.entityId);
  const id = newId();
  const ts = nowIso();
  await sql`INSERT INTO accounts (id, household_id, entity_id, name, type, institution, balance, currency, is_manual, archived, created_at, updated_at)
    VALUES (${id}, ${householdId}, ${a.entityId ?? null}, ${a.name}, ${a.type}, ${a.institution ?? null}, ${toCents(a.balance ?? 0)}, 'BRL', true, false, ${ts}, ${ts})`;
  const [row] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  return shapeAccount(row);
}

export async function updateAccount(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM accounts WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Conta nao encontrada", 404);
  if (patch.entityId) await assertEntityInHousehold(householdId, patch.entityId);
  const next = {
    name: patch.name ?? cur.name,
    type: patch.type ?? cur.type,
    entityId: patch.entityId === undefined ? cur.entity_id : patch.entityId,
    balance: patch.balance === undefined ? Number(cur.balance) : toCents(patch.balance),
    archived: patch.archived === undefined ? cur.archived : !!patch.archived,
  };
  await sql`UPDATE accounts SET name = ${next.name}, type = ${next.type}, entity_id = ${next.entityId}, balance = ${next.balance}, archived = ${next.archived}, updated_at = ${nowIso()} WHERE id = ${id}`;
  const [row] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  return shapeAccount(row);
}

// Usado no sync: cria/atualiza conta pela pluggyAccountId
export async function upsertPluggyAccount(householdId: string, a: {
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  institution?: string | null;
  pluggyItemId: string;
  pluggyAccountId: string;
}): Promise<Row> {
  const [existing] = await sql`SELECT * FROM accounts WHERE pluggy_account_id = ${a.pluggyAccountId} AND household_id = ${householdId}`;
  const ts = nowIso();
  if (existing) {
    await sql`UPDATE accounts SET name = ${a.name}, balance = ${toCents(a.balance)}, currency = ${a.currency}, institution = ${a.institution ?? null}, pluggy_item_id = ${a.pluggyItemId}, updated_at = ${ts} WHERE id = ${existing.id}`;
    const [row] = await sql`SELECT * FROM accounts WHERE id = ${existing.id}`;
    return shapeAccount(row);
  }
  const id = newId();
  await sql`INSERT INTO accounts (id, household_id, entity_id, name, type, institution, balance, currency, pluggy_item_id, pluggy_account_id, is_manual, archived, created_at, updated_at)
    VALUES (${id}, ${householdId}, NULL, ${a.name}, ${a.type}, ${a.institution ?? null}, ${toCents(a.balance)}, ${a.currency}, ${a.pluggyItemId}, ${a.pluggyAccountId}, false, false, ${ts}, ${ts})`;
  const [row] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  return shapeAccount(row);
}

// ---------- Categories (globais, compartilhadas entre households) ----------

function shapeCategory(row: Row): Row {
  return { id: row.id, name: row.name, icon: row.icon, isIncome: row.is_income };
}

export async function listCategories(): Promise<Row[]> {
  const rows = await sql`SELECT * FROM categories ORDER BY name ASC`;
  return rows.map(shapeCategory);
}

export async function findCategoryByName(name: string): Promise<Row | undefined> {
  const [row] = await sql`SELECT * FROM categories WHERE lower(name) = ${name.trim().toLowerCase()} LIMIT 1`;
  return row ? shapeCategory(row) : undefined;
}

export async function upsertCategoryByName(name: string, icon = "💸", isIncome = false): Promise<Row> {
  const [existing] = await sql`SELECT * FROM categories WHERE name = ${name}`;
  if (existing) return shapeCategory(existing);
  const id = newId();
  await sql`INSERT INTO categories (id, name, icon, is_income) VALUES (${id}, ${name}, ${icon}, ${isIncome})`;
  const [row] = await sql`SELECT * FROM categories WHERE id = ${id}`;
  return shapeCategory(row);
}

// ---------- Transactions ----------
// No banco: type ('income'|'expense') + amount_cents (positivo). Para a UI
// expomos "amount" em REAIS com SINAL (despesa negativa) - contrato antigo.

// amount (reais, com sinal) a partir de type + amount_cents (positivo, centavos).
function amountReaisSigned(type: string, amountCents: number | string): number {
  const cents = Number(amountCents);
  return toReais(type === "expense" ? -cents : cents);
}

async function shapeTransaction(row: Row): Promise<Row> {
  const [account] = await sql`SELECT * FROM accounts WHERE id = ${row.account_id}`;
  const [category] = row.category_id
    ? await sql`SELECT * FROM categories WHERE id = ${row.category_id}`
    : [null];
  const [createdBy] = row.created_by_id
    ? await sql`SELECT id, name FROM users WHERE id = ${row.created_by_id}`
    : [null];
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    description: row.description,
    amount: amountReaisSigned(row.type, row.amount_cents),
    type: row.type,
    date: row.date,
    isManual: row.is_manual,
    source: row.source,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    notes: row.notes,
    account: account ? await shapeAccount(account) : null,
    category: category
      ? { id: category.id, name: category.name, icon: category.icon, isIncome: category.is_income }
      : null,
    createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
  };
}

// Listagem com conta, entidade, categoria e autor num JOIN so.
function shapeJoinedTransaction(r: Row): Row {
  return {
    id: r.id,
    accountId: r.account_id,
    categoryId: r.category_id,
    description: r.description,
    amount: amountReaisSigned(r.type, r.amount_cents),
    type: r.type,
    date: r.date,
    isManual: r.is_manual,
    source: r.source,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    notes: r.notes,
    account: {
      id: r.account_id,
      entityId: r.a_entity_id,
      name: r.a_name,
      type: r.a_type,
      institution: r.a_institution,
      balance: toReais(r.a_balance),
      currency: r.a_currency,
      pluggyItemId: r.a_pluggy_item_id,
      pluggyAccountId: r.a_pluggy_account_id,
      isManual: r.a_is_manual,
      archived: r.a_archived,
      entity: r.e_id
        ? { id: r.e_id, name: r.e_name, type: r.e_type, color: r.e_color }
        : null,
    },
    category: r.c_id
      ? { id: r.c_id, name: r.c_name, icon: r.c_icon, isIncome: r.c_is_income }
      : null,
    createdBy: r.u_id ? { id: r.u_id, name: r.u_name } : null,
  };
}

export async function listTransactions(householdId: string, filters: {
  entityId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  month?: string | null;
  limit?: number;
  offset?: number;
}): Promise<Row[]> {
  const pedido = Number(filters.limit);
  const limit = Number.isFinite(pedido) ? Math.min(Math.max(Math.trunc(pedido), 1), 2000) : 300;
  const pulo = Number(filters.offset);
  const offset = Number.isFinite(pulo) && pulo > 0 ? Math.trunc(pulo) : 0;

  const rows = await sql`
    SELECT t.*,
           a.entity_id AS a_entity_id, a.name AS a_name, a.type AS a_type,
           a.institution AS a_institution, a.balance AS a_balance,
           a.currency AS a_currency, a.pluggy_item_id AS a_pluggy_item_id,
           a.pluggy_account_id AS a_pluggy_account_id, a.is_manual AS a_is_manual,
           a.archived AS a_archived,
           e.id AS e_id, e.name AS e_name, e.type AS e_type, e.color AS e_color,
           c.id AS c_id, c.name AS c_name, c.icon AS c_icon, c.is_income AS c_is_income,
           u.id AS u_id, u.name AS u_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN entities e ON e.id = a.entity_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN users u ON u.id = t.created_by_id
    WHERE a.household_id = ${householdId}
      ${filters.accountId ? sql`AND t.account_id = ${filters.accountId}` : sql``}
      ${filters.categoryId ? sql`AND t.category_id = ${filters.categoryId}` : sql``}
      ${filters.entityId ? sql`AND a.entity_id = ${filters.entityId}` : sql``}
      ${filters.month ? sql`AND substr(t.date, 1, 7) = ${filters.month}` : sql``}
    -- Ordena pelos mais recentes, mas mantem as parcelas de uma mesma compra
    -- JUNTAS (na data da 1a parcela) e em ordem CRESCENTE (1/N, 2/N, ...).
    ORDER BY
      COALESCE(
        (SELECT MIN(t2.date) FROM transactions t2 WHERE t2.installment_group_id = t.installment_group_id),
        t.date
      ) DESC,
      t.installment_group_id NULLS FIRST,
      t.installment_number ASC NULLS FIRST,
      -- Desempate final e' obrigatorio com LIMIT/OFFSET: sem ele, linhas
      -- empatadas nos criterios acima podem sair em ordem diferente entre a
      -- pagina 1 e a 2, duplicando uma e sumindo com outra.
      t.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(shapeJoinedTransaction);
}

async function assertAccountInHousehold(householdId: string, accountId: string): Promise<void> {
  const [row] = await sql`SELECT id FROM accounts WHERE id = ${accountId} AND household_id = ${householdId}`;
  if (!row) throw new ApiError("Conta nao encontrada", 404);
}

// Em conta manual o saldo muda a cada lancamento; delta em CENTAVOS (com sinal).
// Conta da Pluggy nao entra aqui - o saldo dela vem do proprio banco.
async function applyBalanceDelta(tx: postgres.TransactionSql, accountId: string, deltaCents: number) {
  if (!deltaCents) return;
  const [account] = await tx`SELECT is_manual FROM accounts WHERE id = ${accountId}`;
  if (!account) throw new ApiError("Conta nao encontrada", 404);
  if (!account.is_manual) return;
  await tx`UPDATE accounts SET balance = balance + ${deltaCents}, updated_at = ${nowIso()} WHERE id = ${accountId}`;
}

// Primeira regra ativa (maior prioridade) que casa com a descricao -> categoryId.
async function ruleCategoryFor(householdId: string, description: string): Promise<string | null> {
  const rules = await sql`
    SELECT * FROM categorization_rules
    WHERE household_id = ${householdId} AND active = true
    ORDER BY priority DESC, created_at ASC
  `;
  for (const r of rules) if (matchRule(r, description)) return r.category_id;
  return null;
}

export async function createTransaction(householdId: string, t: {
  accountId: string;
  description: string;
  amount: number; // reais, com sinal (negativo = despesa)
  date: string;
  categoryId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}): Promise<Row> {
  await assertAccountInHousehold(householdId, t.accountId);
  const id = newId();
  const type = t.amount < 0 ? "expense" : "income";
  const cents = toCents(Math.abs(t.amount));
  // Sem categoria informada, deixa uma regra pre-preencher (lancamento rapido).
  const categoryId = t.categoryId ?? (await ruleCategoryFor(householdId, t.description));
  await inTransaction(async (tx) => {
    await tx`INSERT INTO transactions (id, account_id, category_id, description, type, amount_cents, date, source, is_manual, notes, created_by_id, created_at)
      VALUES (${id}, ${t.accountId}, ${categoryId}, ${t.description}, ${type}, ${cents}, ${toDateOnly(t.date)}, 'manual', true, ${t.notes ?? null}, ${t.createdById ?? null}, ${nowIso()})`;
    await applyBalanceDelta(tx, t.accountId, toCents(t.amount));
  });
  const [row] = await sql`SELECT * FROM transactions WHERE id = ${id}`;
  return shapeTransaction(row);
}

// Compra/divida parcelada: uma linha por mes (mesma installment_group_id).
// Como o "amount" vira parcela depende do mode (ver InstallmentMode):
//   "split" = amount e' o TOTAL da compra; "fixed" = amount e' cada parcela.
// Parcelas sao competencias futuras, entao NAO mexem no saldo atual da conta.
export async function createInstallmentPurchase(householdId: string, t: {
  accountId: string;
  description: string;
  amount: number; // reais: total da compra (split) ou valor da parcela (fixed)
  installments: number;
  mode: InstallmentMode;
  date: string;
  categoryId?: string | null;
  createdById?: string | null;
}): Promise<{ groupId: string; count: number; installmentCents: number[]; totalCents: number }> {
  await assertAccountInHousehold(householdId, t.accountId);
  const n = Math.max(2, Math.min(360, Math.trunc(t.installments)));
  const groupId = newId();
  const parts = installmentPlanCents(toCents(Math.abs(t.amount)), n, t.mode);
  const baseDate = toDateOnly(t.date);
  const categoryId = t.categoryId ?? (await ruleCategoryFor(householdId, t.description));
  await inTransaction(async (tx) => {
    for (let i = 0; i < n; i++) {
      await tx`INSERT INTO transactions
        (id, account_id, category_id, description, type, amount_cents, date, source, installment_group_id, installment_number, installment_total, is_manual, created_by_id, created_at)
        VALUES (${newId()}, ${t.accountId}, ${categoryId}, ${t.description}, 'expense', ${parts[i]}, ${addMonths(baseDate, i)}, 'manual', ${groupId}, ${i + 1}, ${n}, true, ${t.createdById ?? null}, ${nowIso()})`;
    }
  });
  return {
    groupId,
    count: n,
    installmentCents: parts,
    totalCents: parts.reduce((s, x) => s + x, 0),
  };
}

export async function updateTransaction(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`
    SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${id} AND a.household_id = ${householdId}
  `;
  if (!cur) throw new ApiError("Transacao nao encontrada", 404);
  if (patch.accountId) await assertAccountInHousehold(householdId, patch.accountId);

  const oldSignedCents = cur.type === "expense" ? -Number(cur.amount_cents) : Number(cur.amount_cents);
  const newSignedCents = patch.amount === undefined ? oldSignedCents : toCents(patch.amount);
  const next = {
    accountId: patch.accountId ?? cur.account_id,
    description: patch.description ?? cur.description,
    type: newSignedCents < 0 ? "expense" : "income",
    amountCents: Math.abs(newSignedCents),
    date: patch.date ? toDateOnly(patch.date) : cur.date,
    categoryId: patch.categoryId === undefined ? cur.category_id : patch.categoryId,
    notes: patch.notes === undefined ? cur.notes : patch.notes,
  };
  await inTransaction(async (tx) => {
    await tx`UPDATE transactions SET account_id = ${next.accountId}, description = ${next.description}, type = ${next.type}, amount_cents = ${next.amountCents}, date = ${next.date}, category_id = ${next.categoryId}, notes = ${next.notes} WHERE id = ${id}`;
    if (!cur.installment_group_id) {
      if (next.accountId === cur.account_id) {
        await applyBalanceDelta(tx, cur.account_id, newSignedCents - oldSignedCents);
      } else {
        await applyBalanceDelta(tx, cur.account_id, -oldSignedCents);
        await applyBalanceDelta(tx, next.accountId, newSignedCents);
      }
    }
  });
  const [row] = await sql`SELECT * FROM transactions WHERE id = ${id}`;
  return shapeTransaction(row);
}

// Usado no sync (Pluggy): cria/atualiza pela pluggyTransactionId.
export async function upsertPluggyTransaction(t: {
  accountId: string;
  description: string;
  amount: number; // reais, com sinal
  date: string;
  categoryId?: string | null;
  pluggyTransactionId: string;
}): Promise<void> {
  const type = t.amount < 0 ? "expense" : "income";
  const cents = toCents(Math.abs(t.amount));
  const [existing] = await sql`SELECT id FROM transactions WHERE pluggy_transaction_id = ${t.pluggyTransactionId}`;
  if (existing) {
    await sql`UPDATE transactions SET description = ${t.description}, type = ${type}, amount_cents = ${cents}, date = ${toDateOnly(t.date)}, category_id = ${t.categoryId ?? null} WHERE id = ${existing.id}`;
    return;
  }
  await sql`INSERT INTO transactions (id, account_id, category_id, description, type, amount_cents, date, pluggy_transaction_id, source, is_manual, created_at)
    VALUES (${newId()}, ${t.accountId}, ${t.categoryId ?? null}, ${t.description}, ${type}, ${cents}, ${toDateOnly(t.date)}, ${t.pluggyTransactionId}, 'pluggy', false, ${nowIso()})`;
}

// ---------- Import (CSV) + regras de categorizacao ----------

function shapeRule(row: Row): Row {
  return {
    id: row.id,
    matchType: row.match_type,
    pattern: row.pattern,
    categoryId: row.category_id,
    priority: row.priority,
    active: row.active,
  };
}

export async function listRules(householdId: string): Promise<Row[]> {
  const rows = await sql`SELECT * FROM categorization_rules WHERE household_id = ${householdId} ORDER BY priority DESC, created_at ASC`;
  return rows.map(shapeRule);
}

export async function createRule(householdId: string, r: {
  matchType: "contains" | "starts_with" | "regex";
  pattern: string;
  categoryId: string;
  priority?: number;
}): Promise<Row> {
  const [cat] = await sql`SELECT id FROM categories WHERE id = ${r.categoryId}`;
  if (!cat) throw new ApiError("Categoria nao encontrada", 404);
  const id = newId();
  await sql`INSERT INTO categorization_rules (id, household_id, match_type, pattern, category_id, priority, active, created_at)
    VALUES (${id}, ${householdId}, ${r.matchType}, ${r.pattern}, ${r.categoryId}, ${r.priority ?? 0}, true, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM categorization_rules WHERE id = ${id}`;
  return shapeRule(row);
}

export async function setRuleActive(householdId: string, id: string, active: boolean): Promise<void> {
  await sql`UPDATE categorization_rules SET active = ${active} WHERE id = ${id} AND household_id = ${householdId}`;
}

export async function deleteRule(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM categorization_rules WHERE id = ${id} AND household_id = ${householdId}`;
}

// Primeira regra (maior prioridade) que casa com a descricao -> categoryId.
function matchRule(rule: Row, descricao: string): boolean {
  const d = descricao.toLowerCase();
  const p = String(rule.pattern).toLowerCase();
  if (rule.match_type === "contains") return d.includes(p);
  if (rule.match_type === "starts_with") return d.startsWith(p);
  if (rule.match_type === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(descricao);
    } catch {
      return false; // regex invalida do usuario nunca derruba o import
    }
  }
  return false;
}

// Importa varias linhas numa conta. Historico NAO mexe no saldo atual (o saldo
// ja reflete hoje). Dedup por fingerprint (indice unico parcial). Categoria
// vem: (1) do nome mapeado na planilha, senao (2) de uma regra que case.
export async function importTransactions(householdId: string, params: {
  accountId: string;
  filename?: string | null;
  createdById?: string | null;
  rows: { date: string; description: string; amount: number; categoryName?: string | null }[];
}): Promise<{ batchId: string | null; created: number; skipped: number }> {
  await assertAccountInHousehold(householdId, params.accountId);

  // Pre-carrega categorias e regras uma vez (evita query por linha).
  const cats = await sql`SELECT id, lower(name) AS lname FROM categories`;
  const catByName = new Map<string, string>(cats.map((c) => [c.lname, c.id]));
  const rules = await listRules(householdId);
  const activeRules = rules.filter((r) => r.active);

  function resolveCategory(description: string, categoryName?: string | null): string | null {
    if (categoryName) {
      const id = catByName.get(categoryName.trim().toLowerCase());
      if (id) return id;
    }
    for (const rule of activeRules) {
      const raw = { match_type: rule.matchType, pattern: rule.pattern };
      if (matchRule(raw, description)) return rule.categoryId;
    }
    return null;
  }

  const batchId = newId();
  let created = 0;
  let skipped = 0;

  await inTransaction(async (tx) => {
    await tx`INSERT INTO import_batches (id, household_id, account_id, filename, format, row_count, created_by_id, imported_at)
      VALUES (${batchId}, ${householdId}, ${params.accountId}, ${params.filename ?? null}, 'csv', ${params.rows.length}, ${params.createdById ?? null}, ${nowIso()})`;

    for (const r of params.rows) {
      const type = r.amount < 0 ? "expense" : "income";
      const cents = toCents(Math.abs(r.amount));
      const dateIso = toDateOnly(r.date);
      const fingerprint = createHash("sha256")
        .update(`${dateIso.slice(0, 10)}|${cents}|${type}|${normalizeDesc(r.description)}`)
        .digest("hex");
      const categoryId = resolveCategory(r.description, r.categoryName);

      const inserted = await tx`
        INSERT INTO transactions
          (id, account_id, category_id, description, type, amount_cents, date, source, import_batch_id, fingerprint, is_manual, created_by_id, created_at)
        VALUES
          (${newId()}, ${params.accountId}, ${categoryId}, ${r.description}, ${type}, ${cents}, ${dateIso}, 'import', ${batchId}, ${fingerprint}, false, ${params.createdById ?? null}, ${nowIso()})
        ON CONFLICT (account_id, fingerprint) WHERE source = 'import' DO NOTHING
        RETURNING id`;
      if (inserted.length > 0) created += 1;
      else skipped += 1;
    }

    if (created === 0) {
      await tx`DELETE FROM import_batches WHERE id = ${batchId}`;
    } else {
      await tx`UPDATE import_batches SET row_count = ${created} WHERE id = ${batchId}`;
    }
  });

  return { batchId: created > 0 ? batchId : null, created, skipped };
}

// ---------- helpers compartilhados das fases 2-4 ----------

function chaveMes(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function entidadeResumo(entityId: string | null): Promise<Row | null> {
  if (!entityId) return null;
  const [row] = await sql`SELECT id, name, type, color FROM entities WHERE id = ${entityId}`;
  return row || null;
}

// Todas as entidades da casa de uma vez.
//
// As listagens montavam o resumo da entidade linha a linha (um SELECT por meta,
// por conta a pagar, por orcamento). Alem de lento, isso dispara N queries
// CONCORRENTES no mesmo pool via Promise.all - e sob concorrencia o driver
// chegou a estourar o buffer ("offset out of range"), derrubando a rota com 500.
// Uma query so, resolvida em memoria, elimina os dois problemas.
async function mapaEntidades(householdId: string): Promise<Map<string, Row>> {
  const rows = await sql`
    SELECT id, name, type, color FROM entities WHERE household_id = ${householdId}
  `;
  return new Map(rows.map((r) => [r.id as string, r as Row]));
}

function daMapa(mapa: Map<string, Row>, entityId: string | null): Row | null {
  return entityId ? (mapa.get(entityId) ?? null) : null;
}

// ---------- Budgets (orcamento por categoria) ----------

export async function listBudgets(householdId: string, month: number, year: number): Promise<Row[]> {
  const chave = chaveMes(month, year);
  // O gasto de cada orcamento sai de uma agregacao unica por entidade+categoria,
  // em vez de uma query por linha (eram 2 por orcamento, todas concorrentes).
  const [rows, mapa, gastos] = await Promise.all([
    sql`
      SELECT b.*, c.name AS c_name, c.icon AS c_icon
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      WHERE b.household_id = ${householdId} AND b.month = ${month} AND b.year = ${year}
      ORDER BY c.name ASC
    `,
    mapaEntidades(householdId),
    sql`
      SELECT a.entity_id, t.category_id, SUM(t.amount_cents)::bigint AS gasto
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.household_id = ${householdId}
        AND t.type = 'expense'
        AND substr(t.date, 1, 7) = ${chave}
      GROUP BY a.entity_id, t.category_id
    `,
  ]);

  const gastoPor = new Map(gastos.map((g) => [`${g.entity_id}|${g.category_id}`, Number(g.gasto)]));

  return rows.map((b) => {
    const amount = toReais(b.amount);
    const gasto = toReais(gastoPor.get(`${b.entity_id}|${b.category_id}`) ?? 0);
    return {
      id: b.id,
      entityId: b.entity_id,
      categoryId: b.category_id,
      month: b.month,
      year: b.year,
      amount,
      gasto,
      restante: amount - gasto,
      percentUsado: percentUsado(gasto, amount),
      entity: daMapa(mapa, b.entity_id),
      category: { id: b.category_id, name: b.c_name, icon: b.c_icon },
    };
  });
}

export async function upsertBudget(householdId: string, b: {
  entityId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
}): Promise<Row> {
  await assertEntityInHousehold(householdId, b.entityId);
  const cents = toCents(b.amount);
  const [existente] = await sql`
    SELECT id FROM budgets WHERE household_id = ${householdId} AND entity_id = ${b.entityId} AND category_id = ${b.categoryId} AND month = ${b.month} AND year = ${b.year}
  `;

  if (existente) {
    await sql`UPDATE budgets SET amount = ${cents} WHERE id = ${existente.id}`;
    const [row] = await sql`SELECT * FROM budgets WHERE id = ${existente.id}`;
    return { ...row, amount: toReais(row.amount) };
  }
  const id = newId();
  await sql`INSERT INTO budgets (id, household_id, entity_id, category_id, month, year, amount, created_at)
    VALUES (${id}, ${householdId}, ${b.entityId}, ${b.categoryId}, ${b.month}, ${b.year}, ${cents}, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM budgets WHERE id = ${id}`;
  return { ...row, amount: toReais(row.amount) };
}

export async function deleteBudget(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM budgets WHERE id = ${id} AND household_id = ${householdId}`;
}

// Limpa dados financeiros de uma casa preservando usuarios, entidades e
// categorias globais. Usado para zerar o app sem quebrar o cadastro do casal.
export async function clearHouseholdFinancialRecords(householdId: string): Promise<Row> {
  const counts: Row = {};
  await inTransaction(async (tx) => {
    counts.transactions = (await tx`
      DELETE FROM transactions
      WHERE account_id IN (SELECT id FROM accounts WHERE household_id = ${householdId})
      RETURNING id
    `).length;
    counts.importBatches = (await tx`
      DELETE FROM import_batches WHERE household_id = ${householdId} RETURNING id
    `).length;
    counts.bills = (await tx`DELETE FROM bills WHERE household_id = ${householdId} RETURNING id`).length;
    counts.goals = (await tx`DELETE FROM goals WHERE household_id = ${householdId} RETURNING id`).length;
    counts.budgets = (await tx`DELETE FROM budgets WHERE household_id = ${householdId} RETURNING id`).length;
    counts.rules = (await tx`
      DELETE FROM categorization_rules WHERE household_id = ${householdId} RETURNING id
    `).length;
    counts.accounts = (await tx`DELETE FROM accounts WHERE household_id = ${householdId} RETURNING id`).length;
  });
  return counts;
}

// ---------- Goals (metas de economia) ----------

async function shapeGoal(row: Row, mapa?: Map<string, Row>): Promise<Row> {
  const alvoCents = Number(row.target_amount);
  const atualCents = Number(row.current_amount);
  const mensalCents = Number(row.monthly_amount ?? 0);
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    targetAmount: toReais(alvoCents),
    currentAmount: toReais(atualCents),
    monthlyAmount: toReais(mensalCents),
    targetDate: row.target_date,
    percent: goalPercent(atualCents, alvoCents),
    restante: toReais(Math.max(0, alvoCents - atualCents)),
    concluida: atualCents >= alvoCents,
    entity: mapa ? daMapa(mapa, row.entity_id) : await entidadeResumo(row.entity_id),
  };
}

export async function listGoals(householdId: string): Promise<Row[]> {
  const [rows, mapa] = await Promise.all([
    sql`SELECT * FROM goals WHERE household_id = ${householdId} ORDER BY created_at ASC`,
    mapaEntidades(householdId),
  ]);
  return Promise.all(rows.map((r) => shapeGoal(r, mapa)));
}

export async function createGoal(householdId: string, g: {
  entityId: string;
  name: string;
  targetAmount: number;
  currentAmount?: number;
  monthlyAmount?: number;
  targetDate?: string | null;
}): Promise<Row> {
  await assertEntityInHousehold(householdId, g.entityId);
  const id = newId();
  const inicial = toCents(g.currentAmount ?? 0);
  await inTransaction(async (tx) => {
    await tx`INSERT INTO goals (id, household_id, entity_id, name, target_amount, current_amount, monthly_amount, target_date, created_at)
      VALUES (${id}, ${householdId}, ${g.entityId}, ${g.name}, ${toCents(g.targetAmount)}, ${inicial}, ${toCents(g.monthlyAmount ?? 0)}, ${g.targetDate ?? null}, ${nowIso()})`;
    // O "ja guardado" do formulario precisa virar APORTE, senao a meta nasce
    // com current_amount preenchido e ZERO em v_goal_progress - que e' de onde
    // as telas leem o progresso. O usuario digitava 5.000 e via R$ 0,00 / 0%.
    if (inicial !== 0) {
      await tx`INSERT INTO goal_contributions (id, goal_id, household_id, amount_cents, date, note)
        VALUES (${newId()}, ${id}, ${householdId}, ${inicial}, ${dataDeHojeSP()}, 'Saldo informado na criacao da meta')`;
    }
  });
  const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
  return shapeGoal(row);
}

export async function updateGoal(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM goals WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Meta nao encontrada", 404);
  // deposito/currentAmount chegam em reais; tudo em centavos internamente.
  const patchCents = {
    deposito: patch.deposito === undefined ? undefined : toCents(patch.deposito),
    currentAmount: patch.currentAmount === undefined ? undefined : toCents(patch.currentAmount),
  };
  const next = {
    name: patch.name ?? cur.name,
    targetAmount: patch.targetAmount === undefined ? Number(cur.target_amount) : toCents(patch.targetAmount),
    currentAmount: nextGoalAmount(Number(cur.current_amount), patchCents),
    monthlyAmount: patch.monthlyAmount === undefined ? Number(cur.monthly_amount ?? 0) : toCents(patch.monthlyAmount),
    targetDate: patch.targetDate === undefined ? cur.target_date : patch.targetDate,
  };
  await sql`UPDATE goals SET name = ${next.name}, target_amount = ${next.targetAmount}, current_amount = ${next.currentAmount}, monthly_amount = ${next.monthlyAmount}, target_date = ${next.targetDate} WHERE id = ${id}`;
  const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
  return shapeGoal(row);
}

export async function deleteGoal(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM goals WHERE id = ${id} AND household_id = ${householdId}`;
}

// ---------- Aportes de meta (goal_contributions) ----------

// Progresso vem da view: total aportado, aporte do mes corrente e o que falta.
// Somar isso no cliente daria numero diferente por tela.
export async function listGoalProgress(householdId: string): Promise<Row[]> {
  const rows = await sql`
    SELECT * FROM v_goal_progress WHERE household_id = ${householdId} ORDER BY name ASC
  `;
  return rows.map((r) => ({
    goalId: r.goal_id,
    entityId: r.entity_id,
    ownerId: r.owner_id,
    name: r.name,
    targetAmount: toReais(Number(r.target_cents)),
    plannedMonthly: toReais(Number(r.planned_monthly_cents)),
    contributedTotal: toReais(Number(r.contributed_total_cents)),
    contributedThisMonth: toReais(Number(r.contributed_this_month_cents)),
    restante: toReais(Number(r.remaining_cents)),
    percent: goalPercent(Number(r.contributed_total_cents), Number(r.target_cents)),
    concluida: Number(r.contributed_total_cents) >= Number(r.target_cents),
    targetDate: r.target_date,
    lastContributionDate: r.last_contribution_date,
  }));
}

export async function listGoalContributions(householdId: string, goalId: string): Promise<Row[]> {
  const rows = await sql`
    SELECT * FROM goal_contributions
    WHERE household_id = ${householdId} AND goal_id = ${goalId}
    ORDER BY date DESC, created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goal_id,
    amount: toReais(Number(r.amount_cents)),
    date: r.date,
    note: r.note,
    transactionId: r.transaction_id,
  }));
}

// goals.current_amount e' ESPELHO da soma dos aportes, nunca um contador
// proprio. Incrementar com GREATEST(0, atual + delta) parecia inofensivo, mas
// dessincroniza: uma retirada maior que o saldo era clampada em 0 enquanto
// v_goal_progress (que soma a tabela) ficava negativa, e apagar o aporte depois
// devolvia o valor clampado. Recalcular da fonte mantem a invariante
// current_amount == SUM(goal_contributions) em qualquer ordem de operacao.
async function ressincronizarMeta(tx: postgres.TransactionSql, goalId: string) {
  await tx`
    UPDATE goals SET current_amount = COALESCE((
      SELECT SUM(amount_cents) FROM goal_contributions WHERE goal_id = ${goalId}
    ), 0)
    WHERE id = ${goalId}
  `;
}

export async function createGoalContribution(householdId: string, c: {
  goalId: string;
  amount: number; // reais; negativo = retirada/correcao
  date: string;
  note?: string | null;
  createdById?: string | null;
}): Promise<Row> {
  const [goal] = await sql`
    SELECT id FROM goals WHERE id = ${c.goalId} AND household_id = ${householdId}
  `;
  if (!goal) throw new ApiError("Meta nao encontrada", 404);

  const cents = toCents(c.amount);
  if (cents === 0) throw new ApiError("Informe um valor diferente de zero.");

  const id = newId();
  await inTransaction(async (tx) => {
    await tx`INSERT INTO goal_contributions
      (id, goal_id, household_id, amount_cents, date, note, created_by_id)
      VALUES (${id}, ${c.goalId}, ${householdId}, ${cents}, ${toDateOnly(c.date)}, ${c.note ?? null}, ${c.createdById ?? null})`;
    await ressincronizarMeta(tx, c.goalId);
  });

  const [row] = await sql`SELECT * FROM goal_contributions WHERE id = ${id}`;
  return {
    id: row.id,
    goalId: row.goal_id,
    amount: toReais(Number(row.amount_cents)),
    date: row.date,
    note: row.note,
  };
}

// ---------- Dashboard mes a mes ----------
//
// Tudo aqui sai das VIEWS agregadas. O dashboard antigo puxava ate 2000
// transacoes e somava no cliente: lento e sujeito a divergir de tela para tela.

// Meses que tem lancamento, do mais recente para o mais antigo. Alimenta o
// seletor de mes - inclui meses futuros (parcelas ja lancadas).
export async function availableMonths(householdId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT month FROM v_transaction_scope
    WHERE household_id = ${householdId}
    ORDER BY month DESC
  `;
  return rows.map((r) => r.month as string);
}

// Os 12 meses que terminam no mes selecionado - serie do grafico de evolucao.
//
// A view so tem linha para mes COM lancamento. Como o grafico posiciona os
// pontos por indice, devolver so os meses existentes comprimia a linha do tempo:
// um mes parado entre dois movimentados simplesmente sumia e os vizinhos ficavam
// colados, como se fossem consecutivos. A serie e' preenchida com zero para o
// eixo x ser mesmo o tempo.
export async function monthlyEvolution(householdId: string, month: string, meses = 12): Promise<Row[]> {
  const janela = Math.min(Math.max(meses, 2), 36);
  const rows = await sql`
    SELECT month, income_cents, expense_cents, net_cents
    FROM v_household_monthly_summary
    WHERE household_id = ${householdId} AND month <= ${month}
    ORDER BY month DESC
    LIMIT ${janela}
  `;
  if (rows.length === 0) return [];

  const porMes = new Map(rows.map((r) => [r.month as string, r]));
  const primeiro = rows[rows.length - 1].month as string;

  // Do mes mais antigo que tem dado ate o selecionado, sem buraco.
  const serie: Row[] = [];
  for (let m = primeiro; m <= month; m = addMonthKey(m, 1)) {
    const r = porMes.get(m);
    serie.push({
      month: m,
      receitas: toReais(Number(r?.income_cents ?? 0)),
      despesas: toReais(Number(r?.expense_cents ?? 0)),
      liquido: toReais(Number(r?.net_cents ?? 0)),
    });
  }
  return serie;
}

// Payload unico do dashboard de um mes. Uma chamada, tudo ja agregado no banco.
export async function dashboardMonth(householdId: string, month: string): Promise<Row> {
  const [overviewRows, categorias, metasRows, billRows, aporteRows, contas, evolucao, meses, ultimos] =
    await Promise.all([
      sql`
        SELECT o.*, u.name AS owner_name
        FROM v_monthly_overview o
        LEFT JOIN users u ON u.id = o.owner_id
        WHERE o.household_id = ${householdId} AND o.month = ${month}
      `,
      sql`
        SELECT category_id, category_name, category_icon, owner_id, type, total_cents
        FROM v_monthly_category_totals
        WHERE household_id = ${householdId} AND month = ${month} AND type = 'expense'
        ORDER BY total_cents DESC
        LIMIT 12
      `,
      sql`
        SELECT p.*, coalesce(m.contributed_cents, 0) AS month_cents
        FROM v_goal_progress p
        LEFT JOIN v_goal_monthly_contributions m
          ON m.goal_id = p.goal_id AND m.month = ${month}
        WHERE p.household_id = ${householdId}
        ORDER BY p.name ASC
      `,
      sql`
        SELECT b.id, b.name, b.amount, b.due_day, b.last_paid_at, b.recurring, e.owner_id
        FROM bills b
        LEFT JOIN entities e ON e.id = b.entity_id
        WHERE b.household_id = ${householdId}
        ORDER BY b.due_day ASC
      `,
      sql`
        SELECT e.owner_id, sum(c.amount_cents)::bigint AS cents
        FROM goal_contributions c
        JOIN goals g ON g.id = c.goal_id
        LEFT JOIN entities e ON e.id = g.entity_id
        WHERE c.household_id = ${householdId} AND substr(c.date, 1, 7) = ${month}
        GROUP BY e.owner_id
      `,
      sql`
        SELECT type, sum(balance)::bigint AS cents, count(*)::int AS n,
               count(*) FILTER (WHERE entity_id IS NULL)::int AS sem_entidade
        FROM accounts
        WHERE household_id = ${householdId} AND archived = false
        GROUP BY type
      `,
      monthlyEvolution(householdId, month),
      availableMonths(householdId),
      // Do MES selecionado - a lista fica embaixo do seletor, ignorar o filtro
      // ali seria mostrar lancamento de outro mes sob o rotulo deste.
      listTransactions(householdId, { month, limit: 8 }),
    ]);

  const aportePorDono = new Map<string | null, number>(
    aporteRows.map((r) => [r.owner_id ?? null, Number(r.cents)])
  );

  // bills e' INTENCAO recorrente, nao lancamento: a tabela so guarda o ULTIMO
  // pagamento, entao nao da para saber se a conta de um mes passado foi paga.
  //
  // Em mes PASSADO elas nao entram na conta: o que de fato aconteceu ja esta no
  // ledger (em despesas). Somar a bill de novo subtraia o mesmo dinheiro duas
  // vezes da Sobra. Em mes corrente/futuro elas entram como previsto - que e' o
  // ponto de existir uma conta a pagar.
  const mesHoje = mesDeHojeSP();
  const mesCorrente = mesHoje === month;
  const mesPassado = month < mesHoje;

  const bills = billRows.map((b) => ({
    id: b.id,
    name: b.name,
    amount: toReais(Number(b.amount)),
    dueDay: b.due_day,
    ownerId: b.owner_id,
    pago: mesCorrente ? String(b.last_paid_at ?? "").slice(0, 7) === month : false,
  }));

  function billsDe(ownerId: string | null, todos: boolean) {
    if (mesPassado) return 0;
    return bills
      .filter((b) => (todos ? true : b.ownerId === ownerId))
      .reduce((s, b) => s + (b.pago ? 0 : b.amount), 0);
  }

  const colunas = overviewRows.map((r) => {
    const total = r.is_household_total === true;
    const ownerId = total ? null : r.owner_id;
    const contasFixas = billsDe(ownerId, total);
    const aportes = total
      ? Array.from(aportePorDono.values()).reduce((s, v) => s + v, 0)
      : (aportePorDono.get(ownerId) ?? 0);
    const receitas = toReais(Number(r.income_cents));
    const despesas = toReais(Number(r.expense_cents));
    const aportesReais = toReais(aportes);
    return {
      key: total ? "casal" : (ownerId ?? "compartilhado"),
      nome: total ? "Casal" : (r.owner_name ?? "Compartilhado"),
      isTotal: total,
      salario: toReais(Number(r.salary_cents)),
      va: toReais(Number(r.va_cents)),
      vr: toReais(Number(r.vr_cents)),
      parcelas: toReais(Number(r.installments_cents)),
      contasFixas,
      dividas: toReais(Number(r.installments_cents)) + contasFixas,
      investido: toReais(Number(r.invested_cents)),
      aportes: aportesReais,
      receitas,
      despesas,
      // Sobra = renda - o que sai - contas fixas ainda em aberto - aportes.
      sobra: receitas - despesas - contasFixas - aportesReais,
    };
  });

  // Casal primeiro, depois as pessoas por nome, e o "Compartilhado" por ultimo.
  colunas.sort((a, b) => {
    if (a.isTotal !== b.isTotal) return a.isTotal ? -1 : 1;
    if (a.key === "compartilhado") return 1;
    if (b.key === "compartilhado") return -1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return {
    month,
    mesesDisponiveis: meses,
    colunas,
    evolucao,
    categorias: categorias.map((c) => ({
      id: c.category_id,
      nome: c.category_name ?? "Sem categoria",
      icone: c.category_icon,
      total: toReais(Number(c.total_cents)),
    })),
    metas: metasRows.map((m) => ({
      id: m.goal_id,
      nome: m.name,
      alvo: toReais(Number(m.target_cents)),
      guardado: toReais(Number(m.contributed_total_cents)),
      restante: toReais(Number(m.remaining_cents)),
      aporteDoMes: toReais(Number(m.month_cents)),
      planejadoMes: toReais(Number(m.planned_monthly_cents)),
      percent: goalPercent(Number(m.contributed_total_cents), Number(m.target_cents)),
      targetDate: m.target_date,
    })),
    contas: {
      patrimonio: toReais(contas.reduce((s, c) => s + Number(c.cents), 0)),
      investimentos: toReais(
        contas.filter((c) => c.type === "INVESTIMENTO").reduce((s, c) => s + Number(c.cents), 0)
      ),
      total: contas.reduce((s, c) => s + c.n, 0),
      semEntidade: contas.reduce((s, c) => s + c.sem_entidade, 0),
    },
    bills: mesPassado ? [] : bills.filter((b) => !b.pago),
    ultimosLancamentos: ultimos,
  };
}

export async function deleteGoalContribution(householdId: string, id: string): Promise<void> {
  const [row] = await sql`
    SELECT goal_id, amount_cents FROM goal_contributions
    WHERE id = ${id} AND household_id = ${householdId}
  `;
  if (!row) throw new ApiError("Aporte nao encontrado", 404);
  await inTransaction(async (tx) => {
    await tx`DELETE FROM goal_contributions WHERE id = ${id}`;
    await ressincronizarMeta(tx, row.goal_id);
  });
}

// ---------- Bills (contas a pagar / lembretes) ----------

async function shapeBill(row: Row, hoje = new Date(), mapa?: Map<string, Row>): Promise<Row> {
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    amount: toReais(row.amount),
    dueDay: row.due_day,
    recurring: row.recurring,
    lastPaidAt: row.last_paid_at,
    ...billStatus(row.due_day, row.last_paid_at, hoje),
    entity: mapa ? daMapa(mapa, row.entity_id) : await entidadeResumo(row.entity_id),
  };
}

export async function listBills(householdId: string): Promise<Row[]> {
  const [rows, mapa] = await Promise.all([
    sql`SELECT * FROM bills WHERE household_id = ${householdId} ORDER BY due_day ASC`,
    mapaEntidades(householdId),
  ]);
  const hoje = new Date();
  return Promise.all(rows.map((r) => shapeBill(r, hoje, mapa)));
}

export async function createBill(householdId: string, b: {
  entityId: string;
  name: string;
  amount: number;
  dueDay: number;
  recurring?: boolean;
}): Promise<Row> {
  await assertEntityInHousehold(householdId, b.entityId);
  const id = newId();
  await sql`INSERT INTO bills (id, household_id, entity_id, name, amount, due_day, recurring, created_at)
    VALUES (${id}, ${householdId}, ${b.entityId}, ${b.name}, ${toCents(b.amount)}, ${b.dueDay}, ${b.recurring !== false}, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM bills WHERE id = ${id}`;
  return shapeBill(row);
}

export async function updateBill(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM bills WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Conta a pagar nao encontrada", 404);
  const next = {
    name: patch.name ?? cur.name,
    amount: patch.amount === undefined ? Number(cur.amount) : toCents(patch.amount),
    dueDay: patch.dueDay === undefined ? cur.due_day : patch.dueDay,
    recurring: patch.recurring === undefined ? cur.recurring : !!patch.recurring,
    lastPaidAt:
      patch.pagar === true
        ? nowIso()
        : patch.pagar === false
        ? null
        : patch.lastPaidAt === undefined
        ? cur.last_paid_at
        : patch.lastPaidAt,
  };
  await sql`UPDATE bills SET name = ${next.name}, amount = ${next.amount}, due_day = ${next.dueDay}, recurring = ${next.recurring}, last_paid_at = ${next.lastPaidAt} WHERE id = ${id}`;
  const [row] = await sql`SELECT * FROM bills WHERE id = ${id}`;
  return shapeBill(row);
}

export async function deleteBill(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM bills WHERE id = ${id} AND household_id = ${householdId}`;
}

// ---------- Relatorios ----------

// Receita x despesa dos ultimos N meses (valores em reais).
export async function monthlySummary(householdId: string, months = 6, entityId?: string | null): Promise<Row[]> {
  const limite = Math.min(Math.max(months, 1), 36);
  const rows = await sql`
    SELECT substr(t.date, 1, 7) AS mes,
           COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS receita,
           COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS despesa
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.household_id = ${householdId} ${entityId ? sql`AND a.entity_id = ${entityId}` : sql``}
    GROUP BY mes
    ORDER BY mes DESC
    LIMIT ${limite}
  `;

  return rows
    .slice()
    .reverse()
    .map((r) => {
      const receita = toReais(r.receita);
      const despesa = toReais(r.despesa);
      return { mes: r.mes, receita, despesa, saldo: receita - despesa };
    });
}

// Gasto por categoria num mes (valores em reais).
export async function spendingByCategory(householdId: string, month: number, year: number, entityId?: string | null): Promise<Row[]> {
  const chave = chaveMes(month, year);
  const rows = await sql`
    SELECT c.id AS id, c.name AS name, c.icon AS icon,
           COALESCE(SUM(t.amount_cents), 0) AS gasto
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND a.household_id = ${householdId} AND substr(t.date, 1, 7) = ${chave} ${entityId ? sql`AND a.entity_id = ${entityId}` : sql``}
    GROUP BY c.id, c.name, c.icon
    HAVING COALESCE(SUM(t.amount_cents), 0) > 0
    ORDER BY gasto DESC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, gasto: toReais(r.gasto) }));
}
