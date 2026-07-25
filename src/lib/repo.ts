// Funcoes de acesso ao banco (Postgres/Supabase). Retornam objetos ja no
// formato que as telas esperam (camelCase, com entity/category/owner
// aninhados quando faz sentido) - as colunas no banco sao snake_case, entao
// as funcoes "shape*" fazem essa ponte.
//
// Isolamento multi-tenant: entities/accounts/budgets/goals/bills pertencem a
// um household (household_id). Toda leitura/escrita dessas tabelas exige o
// householdId de quem esta autenticado (resolvido em requireSession) e as
// funcoes de update/delete conferem que o registro pertence aquele household
// antes de mexer - visitante nao pode ler nem adivinhar id de outra casa.

import { randomBytes, createHash } from "node:crypto";
import { sql, newId, nowIso } from "./db";
import type postgres from "postgres";
import { billStatus, goalPercent, nextGoalAmount, percentUsado } from "./rules";
import { ApiError } from "./errors";

export type EntityType = "CASA" | "PESSOAL" | "PJ";
export type AccountType =
  | "CORRENTE"
  | "POUPANCA"
  | "CARTAO"
  | "INVESTIMENTO"
  | "DINHEIRO"
  | "OUTRO";

type Row = Record<string, any>;

// Agrupa varias escritas numa transacao so: ou tudo grava, ou nada grava.
// Usado onde um lancamento mexe em mais de uma tabela (transacao + saldo).
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
// por quem administra o deploy) - fica verificado desde a criacao, sem
// precisar do fluxo de confirmacao por email.
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

// Cadastro pela tela /registrar: nasce com a senha padrao (Muda@123),
// obrigado a trocar no primeiro login, e sem email verificado ate clicar no
// link. Diferente de upsertUser, NAO sobrescreve um email ja existente -
// cadastro duplicado e erro, nao upsert.
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

// Troca de senha do proprio usuario (tela /trocar-senha). Limpa a obrigacao
// de trocar - a partir daqui o login segue normal.
export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash}, must_change_password = false WHERE id = ${userId}`;
}

// ---------- Verificacao de email ----------

// So o hash do token fica no banco - um vazamento da tabela nao da login a
// ninguem. O token bruto so existe na hora de montar o link do email.
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (${newId()}, ${userId}, ${tokenHash}, ${expiresAt}, ${nowIso()})`;
  return rawToken;
}

// Confere o token, marca o email como verificado e consome o token (uso
// unico). Numa conta casal, o clique de UM dos dois confirma a casa inteira
// (o titular ja informou o email do conjuge no cadastro) - por isso retorna
// a lista de usuarios verificados neste clique, ou null se o token nao
// existe, expirou ou ja foi usado.
export async function consumeEmailVerificationToken(rawToken: string): Promise<Row[] | null> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await sql`SELECT * FROM email_verification_tokens WHERE token_hash = ${tokenHash}`;
  if (!row) return null;

  await sql`DELETE FROM email_verification_tokens WHERE id = ${row.id}`;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const ts = nowIso();
  const householdId = await getHouseholdIdForUser(row.user_id);
  if (!householdId) {
    await sql`UPDATE users SET email_verified_at = ${ts} WHERE id = ${row.user_id}`;
    const user = await getUserById(row.user_id);
    return user ? [user] : null;
  }

  const membros = await sql`
    SELECT u.* FROM users u
    JOIN household_members hm ON hm.user_id = u.id
    WHERE hm.household_id = ${householdId}
  `;
  const pendentes = membros.filter((m) => !m.email_verified_at);
  for (const m of pendentes) {
    await sql`UPDATE users SET email_verified_at = ${ts} WHERE id = ${m.id}`;
  }
  if (pendentes.length > 0) return pendentes.map(shapeUser);

  // Token do segundo clique de um casal ja confirmado: nada a fazer, mas o
  // link continua valendo como "deu certo".
  const user = await getUserById(row.user_id);
  return user ? [user] : null;
}

// ---------- Households ----------

function shapeHousehold(row: Row): Row {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, createdAt: row.created_at };
}

function generateInviteCode(): string {
  return randomBytes(4).toString("hex"); // 8 caracteres, facil de digitar/compartilhar
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

export async function addHouseholdMember(householdId: string, userId: string): Promise<void> {
  await sql`INSERT INTO household_members (household_id, user_id, joined_at)
    VALUES (${householdId}, ${userId}, ${nowIso()}) ON CONFLICT DO NOTHING`;
}

// ---------- Entities ----------

async function shapeEntity(row: Row): Promise<Row> {
  const owner = row.owner_id ? await getUserById(row.owner_id) : null;
  const accountRows = await sql`SELECT * FROM accounts WHERE entity_id = ${row.id} AND archived = false`;
  // A entidade das contas ja e esta - passamos adiante para nao consultar de novo.
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

export async function createEntity(householdId: string, e: {
  name: string;
  type: EntityType;
  ownerId?: string | null;
  color?: string;
}): Promise<Row> {
  const id = newId();
  await sql`INSERT INTO entities (id, household_id, name, type, owner_id, color, archived, created_at)
    VALUES (${id}, ${householdId}, ${e.name}, ${e.type}, ${e.ownerId ?? null}, ${e.color ?? "#6366f1"}, false, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM entities WHERE id = ${id}`;
  return shapeEntity(row);
}

export async function updateEntity(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM entities WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Entidade nao encontrada", 404);
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
    balance: row.balance,
    currency: row.currency,
    pluggyItemId: row.pluggy_item_id,
    pluggyAccountId: row.pluggy_account_id,
    isManual: row.is_manual,
    archived: row.archived,
    entity: entity || null,
  };
}

// Confere que a entidade informada (se houver) e' realmente do household -
// evita que alguem associe uma conta/orcamento/meta a entidade de outra casa
// so por adivinhar o id.
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
    VALUES (${id}, ${householdId}, ${a.entityId ?? null}, ${a.name}, ${a.type}, ${a.institution ?? null}, ${a.balance ?? 0}, 'BRL', true, false, ${ts}, ${ts})`;
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
    balance: patch.balance === undefined ? cur.balance : patch.balance,
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
    await sql`UPDATE accounts SET name = ${a.name}, balance = ${a.balance}, currency = ${a.currency}, institution = ${a.institution ?? null}, pluggy_item_id = ${a.pluggyItemId}, updated_at = ${ts} WHERE id = ${existing.id}`;
    const [row] = await sql`SELECT * FROM accounts WHERE id = ${existing.id}`;
    return shapeAccount(row);
  }
  const id = newId();
  await sql`INSERT INTO accounts (id, household_id, entity_id, name, type, institution, balance, currency, pluggy_item_id, pluggy_account_id, is_manual, archived, created_at, updated_at)
    VALUES (${id}, ${householdId}, NULL, ${a.name}, ${a.type}, ${a.institution ?? null}, ${a.balance}, ${a.currency}, ${a.pluggyItemId}, ${a.pluggyAccountId}, false, false, ${ts}, ${ts})`;
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

export async function upsertCategoryByName(name: string, icon = "💸", isIncome = false): Promise<Row> {
  const [existing] = await sql`SELECT * FROM categories WHERE name = ${name}`;
  if (existing) return shapeCategory(existing);
  const id = newId();
  await sql`INSERT INTO categories (id, name, icon, is_income) VALUES (${id}, ${name}, ${icon}, ${isIncome})`;
  const [row] = await sql`SELECT * FROM categories WHERE id = ${id}`;
  return shapeCategory(row);
}

// ---------- Transactions ----------
// Nao tem household_id proprio - sempre passam pela conta (account_id), que
// ja e' do household certo. Toda query filtra via JOIN com accounts.

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
    amount: row.amount,
    date: row.date,
    isManual: row.is_manual,
    notes: row.notes,
    account: account ? await shapeAccount(account) : null,
    category: category
      ? { id: category.id, name: category.name, icon: category.icon, isIncome: category.is_income }
      : null,
    createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
  };
}

// A listagem traz conta, entidade, categoria e autor num JOIN so, em vez de
// uma consulta por linha (a tela abre centenas de lancamentos de uma vez).
function shapeJoinedTransaction(r: Row): Row {
  return {
    id: r.id,
    accountId: r.account_id,
    categoryId: r.category_id,
    description: r.description,
    amount: r.amount,
    date: r.date,
    isManual: r.is_manual,
    notes: r.notes,
    account: {
      id: r.account_id,
      entityId: r.a_entity_id,
      name: r.a_name,
      type: r.a_type,
      institution: r.a_institution,
      balance: r.a_balance,
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
  limit?: number;
}): Promise<Row[]> {
  // O limite entra como parametro (nunca concatenado) e com teto, para uma
  // querystring maluca nao virar consulta gigante.
  const pedido = Number(filters.limit);
  const limit = Number.isFinite(pedido) ? Math.min(Math.max(Math.trunc(pedido), 1), 2000) : 300;

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
    ORDER BY t.date DESC
    LIMIT ${limit}
  `;
  return rows.map(shapeJoinedTransaction);
}

// Confere que a conta informada e' realmente do household.
async function assertAccountInHousehold(householdId: string, accountId: string): Promise<void> {
  const [row] = await sql`SELECT id FROM accounts WHERE id = ${accountId} AND household_id = ${householdId}`;
  if (!row) throw new ApiError("Conta nao encontrada", 404);
}

// Em conta manual (carteira, dinheiro em especie) o saldo so muda se a gente
// mexer nele: entao cada lancamento manual soma/subtrai do saldo da conta.
// Conta vinda da Pluggy nao entra aqui - o saldo dela vem do proprio banco.
async function applyBalanceDelta(tx: postgres.TransactionSql, accountId: string, delta: number) {
  if (!delta) return;
  const [account] = await tx`SELECT is_manual FROM accounts WHERE id = ${accountId}`;
  if (!account) throw new ApiError("Conta nao encontrada", 404);
  if (!account.is_manual) return;
  await tx`UPDATE accounts SET balance = balance + ${delta}, updated_at = ${nowIso()} WHERE id = ${accountId}`;
}

export async function createTransaction(householdId: string, t: {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}): Promise<Row> {
  await assertAccountInHousehold(householdId, t.accountId);
  const id = newId();
  await inTransaction(async (tx) => {
    await tx`INSERT INTO transactions (id, account_id, category_id, description, amount, date, is_manual, notes, created_by_id, created_at)
      VALUES (${id}, ${t.accountId}, ${t.categoryId ?? null}, ${t.description}, ${t.amount}, ${new Date(t.date).toISOString()}, true, ${t.notes ?? null}, ${t.createdById ?? null}, ${nowIso()})`;
    await applyBalanceDelta(tx, t.accountId, t.amount);
  });
  const [row] = await sql`SELECT * FROM transactions WHERE id = ${id}`;
  return shapeTransaction(row);
}

export async function updateTransaction(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`
    SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${id} AND a.household_id = ${householdId}
  `;
  if (!cur) throw new ApiError("Transacao nao encontrada", 404);
  const next = {
    description: patch.description ?? cur.description,
    amount: patch.amount === undefined ? cur.amount : patch.amount,
    date: patch.date ? new Date(patch.date).toISOString() : cur.date,
    categoryId: patch.categoryId === undefined ? cur.category_id : patch.categoryId,
    notes: patch.notes === undefined ? cur.notes : patch.notes,
  };
  await inTransaction(async (tx) => {
    await tx`UPDATE transactions SET description = ${next.description}, amount = ${next.amount}, date = ${next.date}, category_id = ${next.categoryId}, notes = ${next.notes} WHERE id = ${id}`;
    // So a diferenca entra no saldo (editar 50 para 70 mexe 20, nao 70).
    await applyBalanceDelta(tx, cur.account_id, next.amount - cur.amount);
  });
  const [row] = await sql`SELECT * FROM transactions WHERE id = ${id}`;
  return shapeTransaction(row);
}

// Usado no sync: cria/atualiza transacao pela pluggyTransactionId. A conta
// (accountId) ja vem de upsertPluggyAccount, que so opera dentro do household
// de quem chamou o sync - nao precisa reconferir aqui.
export async function upsertPluggyTransaction(t: {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  pluggyTransactionId: string;
}): Promise<void> {
  const [existing] = await sql`SELECT id FROM transactions WHERE pluggy_transaction_id = ${t.pluggyTransactionId}`;
  if (existing) {
    await sql`UPDATE transactions SET description = ${t.description}, amount = ${t.amount}, date = ${new Date(t.date).toISOString()}, category_id = ${t.categoryId ?? null} WHERE id = ${existing.id}`;
    return;
  }
  await sql`INSERT INTO transactions (id, account_id, category_id, description, amount, date, pluggy_transaction_id, is_manual, created_at)
    VALUES (${newId()}, ${t.accountId}, ${t.categoryId ?? null}, ${t.description}, ${t.amount}, ${new Date(t.date).toISOString()}, ${t.pluggyTransactionId}, false, ${nowIso()})`;
}

// ---------- helpers compartilhados das fases 2-4 ----------

// "YYYY-MM" a partir de mes (1-12) e ano; e o prefixo da data ISO guardada nas
// transacoes, entao da para filtrar o mes com substr(date,1,7).
function chaveMes(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function entidadeResumo(entityId: string | null): Promise<Row | null> {
  if (!entityId) return null;
  const [row] = await sql`SELECT id, name, type, color FROM entities WHERE id = ${entityId}`;
  return row || null;
}

// Quanto ja foi gasto (despesas, valor negativo) numa entidade+categoria num mes.
async function gastoDoMes(entityId: string, categoryId: string, chave: string): Promise<number> {
  const [r] = await sql`
    SELECT COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) AS gasto
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.entity_id = ${entityId} AND t.category_id = ${categoryId} AND substr(t.date, 1, 7) = ${chave}
  `;
  return Number(r.gasto);
}

// ---------- Budgets (orcamento por categoria) ----------

export async function listBudgets(householdId: string, month: number, year: number): Promise<Row[]> {
  const chave = chaveMes(month, year);
  const rows = await sql`
    SELECT b.*, c.name AS c_name, c.icon AS c_icon
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.household_id = ${householdId} AND b.month = ${month} AND b.year = ${year}
    ORDER BY c.name ASC
  `;

  return Promise.all(
    rows.map(async (b) => {
      const gasto = await gastoDoMes(b.entity_id, b.category_id, chave);
      return {
        id: b.id,
        entityId: b.entity_id,
        categoryId: b.category_id,
        month: b.month,
        year: b.year,
        amount: b.amount,
        gasto,
        restante: b.amount - gasto,
        percentUsado: percentUsado(gasto, b.amount),
        entity: await entidadeResumo(b.entity_id),
        category: { id: b.category_id, name: b.c_name, icon: b.c_icon },
      };
    })
  );
}

// Cria ou atualiza o orcamento daquela entidade+categoria+mes (a tabela tem
// UNIQUE nesses campos, entao mexer no mesmo mes so troca o valor).
export async function upsertBudget(householdId: string, b: {
  entityId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
}): Promise<Row> {
  await assertEntityInHousehold(householdId, b.entityId);
  const [existente] = await sql`
    SELECT id FROM budgets WHERE household_id = ${householdId} AND entity_id = ${b.entityId} AND category_id = ${b.categoryId} AND month = ${b.month} AND year = ${b.year}
  `;

  if (existente) {
    await sql`UPDATE budgets SET amount = ${b.amount} WHERE id = ${existente.id}`;
    const [row] = await sql`SELECT * FROM budgets WHERE id = ${existente.id}`;
    return row;
  }
  const id = newId();
  await sql`INSERT INTO budgets (id, household_id, entity_id, category_id, month, year, amount, created_at)
    VALUES (${id}, ${householdId}, ${b.entityId}, ${b.categoryId}, ${b.month}, ${b.year}, ${b.amount}, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM budgets WHERE id = ${id}`;
  return row;
}

export async function deleteBudget(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM budgets WHERE id = ${id} AND household_id = ${householdId}`;
}

// ---------- Goals (metas de economia) ----------

async function shapeGoal(row: Row): Promise<Row> {
  const alvo = row.target_amount as number;
  const atual = row.current_amount as number;
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    targetAmount: alvo,
    currentAmount: atual,
    targetDate: row.target_date,
    percent: goalPercent(atual, alvo),
    restante: Math.max(0, alvo - atual),
    concluida: atual >= alvo,
    entity: await entidadeResumo(row.entity_id),
  };
}

export async function listGoals(householdId: string): Promise<Row[]> {
  const rows = await sql`SELECT * FROM goals WHERE household_id = ${householdId} ORDER BY created_at ASC`;
  return Promise.all(rows.map(shapeGoal));
}

export async function createGoal(householdId: string, g: {
  entityId: string;
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
}): Promise<Row> {
  await assertEntityInHousehold(householdId, g.entityId);
  const id = newId();
  await sql`INSERT INTO goals (id, household_id, entity_id, name, target_amount, current_amount, target_date, created_at)
    VALUES (${id}, ${householdId}, ${g.entityId}, ${g.name}, ${g.targetAmount}, ${g.currentAmount ?? 0}, ${g.targetDate ?? null}, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
  return shapeGoal(row);
}

export async function updateGoal(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM goals WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Meta nao encontrada", 404);
  const next = {
    name: patch.name ?? cur.name,
    targetAmount: patch.targetAmount === undefined ? cur.target_amount : patch.targetAmount,
    currentAmount: nextGoalAmount(cur.current_amount, patch),
    targetDate: patch.targetDate === undefined ? cur.target_date : patch.targetDate,
  };
  await sql`UPDATE goals SET name = ${next.name}, target_amount = ${next.targetAmount}, current_amount = ${next.currentAmount}, target_date = ${next.targetDate} WHERE id = ${id}`;
  const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
  return shapeGoal(row);
}

export async function deleteGoal(householdId: string, id: string): Promise<void> {
  await sql`DELETE FROM goals WHERE id = ${id} AND household_id = ${householdId}`;
}

// ---------- Bills (contas a pagar / lembretes) ----------

async function shapeBill(row: Row, hoje = new Date()): Promise<Row> {
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    amount: row.amount,
    dueDay: row.due_day,
    recurring: row.recurring,
    lastPaidAt: row.last_paid_at,
    ...billStatus(row.due_day, row.last_paid_at, hoje),
    entity: await entidadeResumo(row.entity_id),
  };
}

export async function listBills(householdId: string): Promise<Row[]> {
  const rows = await sql`SELECT * FROM bills WHERE household_id = ${householdId} ORDER BY due_day ASC`;
  return Promise.all(rows.map((r) => shapeBill(r)));
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
    VALUES (${id}, ${householdId}, ${b.entityId}, ${b.name}, ${b.amount}, ${b.dueDay}, ${b.recurring !== false}, ${nowIso()})`;
  const [row] = await sql`SELECT * FROM bills WHERE id = ${id}`;
  return shapeBill(row);
}

export async function updateBill(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM bills WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Conta a pagar nao encontrada", 404);
  const next = {
    name: patch.name ?? cur.name,
    amount: patch.amount === undefined ? cur.amount : patch.amount,
    dueDay: patch.dueDay === undefined ? cur.due_day : patch.dueDay,
    recurring: patch.recurring === undefined ? cur.recurring : !!patch.recurring,
    // "pagar": marca como pago agora; "desmarcar": limpa o pagamento.
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

// ---------- Relatorios (fase 4) ----------

// Receita x despesa dos ultimos N meses (para o grafico de barras). Opcionalmente
// filtra por entidade.
export async function monthlySummary(householdId: string, months = 6, entityId?: string | null): Promise<Row[]> {
  const limite = Math.min(Math.max(months, 1), 36);
  const rows = await sql`
    SELECT substr(t.date, 1, 7) AS mes,
           COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS receita,
           COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) AS despesa
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.household_id = ${householdId} ${entityId ? sql`AND a.entity_id = ${entityId}` : sql``}
    GROUP BY mes
    ORDER BY mes DESC
    LIMIT ${limite}
  `;

  // Vem do mais recente para o mais antigo; devolve em ordem cronologica.
  return rows
    .slice()
    .reverse()
    .map((r) => ({
      mes: r.mes,
      receita: r.receita,
      despesa: r.despesa,
      saldo: r.receita - r.despesa,
    }));
}

// Gasto por categoria num mes (para o grafico de composicao das despesas).
export async function spendingByCategory(householdId: string, month: number, year: number, entityId?: string | null): Promise<Row[]> {
  const chave = chaveMes(month, year);
  const rows = await sql`
    SELECT c.id AS id, c.name AS name, c.icon AS icon,
           COALESCE(SUM(-t.amount), 0) AS gasto
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    WHERE t.amount < 0 AND a.household_id = ${householdId} AND substr(t.date, 1, 7) = ${chave} ${entityId ? sql`AND a.entity_id = ${entityId}` : sql``}
    GROUP BY c.id, c.name, c.icon
    HAVING COALESCE(SUM(-t.amount), 0) > 0
    ORDER BY gasto DESC
  `;
  return rows;
}
