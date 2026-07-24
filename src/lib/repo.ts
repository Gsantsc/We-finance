// Funcoes de acesso ao banco. Retornam objetos ja no formato que as telas
// esperam (com entity, category e owner aninhados quando faz sentido).

import { db, newId, nowIso } from "./db";

export type EntityType = "CASA" | "PESSOAL" | "PJ";
export type AccountType =
  | "CORRENTE"
  | "POUPANCA"
  | "CARTAO"
  | "INVESTIMENTO"
  | "DINHEIRO"
  | "OUTRO";

type Row = Record<string, any>;

function bool(v: any): boolean {
  return v === 1 || v === true;
}

// Agrupa varias escritas numa transacao so: ou tudo grava, ou nada grava.
// Usado onde um lancamento mexe em mais de uma tabela (transacao + saldo).
function inTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Users ----------

export function getUserByEmail(email: string): Row | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Row | undefined;
}

export function getUserById(id: string): Row | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
}

export function upsertUser(u: {
  name: string;
  email: string;
  passwordHash: string;
}): Row {
  const existing = getUserByEmail(u.email);
  if (existing) {
    // Atualiza tambem a senha: e assim que o README manda recuperar acesso
    // (troca USER*_PASSWORD no .env e roda o seed de novo).
    db.prepare("UPDATE users SET name = ?, passwordHash = ? WHERE id = ?").run(
      u.name,
      u.passwordHash,
      existing.id
    );
    return getUserById(existing.id)!;
  }
  const id = newId();
  db.prepare(
    "INSERT INTO users (id, name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(id, u.name, u.email, u.passwordHash, nowIso());
  return getUserById(id)!;
}

// ---------- Entities ----------

function shapeEntity(row: Row): Row {
  const owner = row.ownerId ? getUserById(row.ownerId) : null;
  const accounts = db
    .prepare("SELECT * FROM accounts WHERE entityId = ? AND archived = 0")
    .all(row.id) as Row[];
  // A entidade das contas ja e esta - passamos adiante para nao consultar de novo.
  const resumo = { id: row.id, name: row.name, type: row.type, color: row.color };
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    ownerId: row.ownerId,
    color: row.color,
    archived: bool(row.archived),
    createdAt: row.createdAt,
    owner: owner ? { id: owner.id, name: owner.name } : null,
    accounts: accounts.map((a) => shapeAccount(a, resumo)),
  };
}

export function listEntities(): Row[] {
  const rows = db
    .prepare("SELECT * FROM entities WHERE archived = 0 ORDER BY createdAt ASC")
    .all() as Row[];
  return rows.map(shapeEntity);
}

export function findEntityByName(name: string): Row | undefined {
  return db.prepare("SELECT * FROM entities WHERE name = ?").get(name) as Row | undefined;
}

export function createEntity(e: {
  name: string;
  type: EntityType;
  ownerId?: string | null;
  color?: string;
}): Row {
  const id = newId();
  db.prepare(
    "INSERT INTO entities (id, name, type, ownerId, color, archived, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ).run(id, e.name, e.type, e.ownerId ?? null, e.color ?? "#6366f1", nowIso());
  return db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as Row;
}

export function updateEntity(id: string, patch: Row): Row {
  const cur = db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as Row;
  if (!cur) throw new Error("Entidade nao encontrada");
  const next = {
    name: patch.name ?? cur.name,
    type: patch.type ?? cur.type,
    ownerId: patch.ownerId === undefined ? cur.ownerId : patch.ownerId,
    color: patch.color ?? cur.color,
    archived: patch.archived === undefined ? cur.archived : patch.archived ? 1 : 0,
  };
  db.prepare(
    "UPDATE entities SET name = ?, type = ?, ownerId = ?, color = ?, archived = ? WHERE id = ?"
  ).run(next.name, next.type, next.ownerId, next.color, next.archived, id);
  return db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as Row;
}

// ---------- Accounts ----------

function shapeAccount(row: Row, knownEntity?: Row | null): Row {
  const entity =
    knownEntity !== undefined
      ? knownEntity
      : row.entityId
      ? (db.prepare("SELECT id, name, type, color FROM entities WHERE id = ?").get(row.entityId) as Row)
      : null;
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    balance: row.balance,
    currency: row.currency,
    pluggyItemId: row.pluggyItemId,
    pluggyAccountId: row.pluggyAccountId,
    isManual: bool(row.isManual),
    archived: bool(row.archived),
    entity: entity || null,
  };
}

export function listAccounts(): Row[] {
  const rows = db
    .prepare("SELECT * FROM accounts WHERE archived = 0 ORDER BY createdAt ASC")
    .all() as Row[];
  return rows.map((r) => shapeAccount(r));
}

export function createAccount(a: {
  name: string;
  type: AccountType;
  entityId?: string | null;
  balance?: number;
  institution?: string | null;
}): Row {
  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO accounts (id, entityId, name, type, institution, balance, currency, isManual, archived, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'BRL', 1, 0, ?, ?)`
  ).run(id, a.entityId ?? null, a.name, a.type, a.institution ?? null, a.balance ?? 0, ts, ts);
  return shapeAccount(db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row);
}

export function updateAccount(id: string, patch: Row): Row {
  const cur = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row;
  if (!cur) throw new Error("Conta nao encontrada");
  const next = {
    name: patch.name ?? cur.name,
    type: patch.type ?? cur.type,
    entityId: patch.entityId === undefined ? cur.entityId : patch.entityId,
    balance: patch.balance === undefined ? cur.balance : patch.balance,
    archived: patch.archived === undefined ? cur.archived : patch.archived ? 1 : 0,
  };
  db.prepare(
    "UPDATE accounts SET name = ?, type = ?, entityId = ?, balance = ?, archived = ?, updatedAt = ? WHERE id = ?"
  ).run(next.name, next.type, next.entityId, next.balance, next.archived, nowIso(), id);
  return shapeAccount(db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row);
}

// Usado no sync: cria/atualiza conta pela pluggyAccountId
export function upsertPluggyAccount(a: {
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  institution?: string | null;
  pluggyItemId: string;
  pluggyAccountId: string;
}): Row {
  const existing = db
    .prepare("SELECT * FROM accounts WHERE pluggyAccountId = ?")
    .get(a.pluggyAccountId) as Row | undefined;
  const ts = nowIso();
  if (existing) {
    db.prepare(
      "UPDATE accounts SET name = ?, balance = ?, currency = ?, institution = ?, pluggyItemId = ?, updatedAt = ? WHERE id = ?"
    ).run(a.name, a.balance, a.currency, a.institution ?? null, a.pluggyItemId, ts, existing.id);
    return db.prepare("SELECT * FROM accounts WHERE id = ?").get(existing.id) as Row;
  }
  const id = newId();
  db.prepare(
    `INSERT INTO accounts (id, entityId, name, type, institution, balance, currency, pluggyItemId, pluggyAccountId, isManual, archived, createdAt, updatedAt)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(id, a.name, a.type, a.institution ?? null, a.balance, a.currency, a.pluggyItemId, a.pluggyAccountId, ts, ts);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row;
}

// ---------- Categories ----------

export function listCategories(): Row[] {
  return db.prepare("SELECT * FROM categories ORDER BY name ASC").all() as Row[];
}

export function upsertCategoryByName(name: string, icon = "💸", isIncome = false): Row {
  const existing = db.prepare("SELECT * FROM categories WHERE name = ?").get(name) as Row | undefined;
  if (existing) return existing;
  const id = newId();
  db.prepare("INSERT INTO categories (id, name, icon, isIncome) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    icon,
    isIncome ? 1 : 0
  );
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Row;
}

// ---------- Transactions ----------

function shapeTransaction(row: Row): Row {
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.accountId) as Row;
  const category = row.categoryId
    ? (db.prepare("SELECT * FROM categories WHERE id = ?").get(row.categoryId) as Row)
    : null;
  const createdBy = row.createdById
    ? (db.prepare("SELECT id, name FROM users WHERE id = ?").get(row.createdById) as Row)
    : null;
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    description: row.description,
    amount: row.amount,
    date: row.date,
    isManual: bool(row.isManual),
    notes: row.notes,
    account: account ? shapeAccount(account) : null,
    category: category
      ? { id: category.id, name: category.name, icon: category.icon, isIncome: bool(category.isIncome) }
      : null,
    createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
  };
}

// A listagem traz conta, entidade, categoria e autor num JOIN so, em vez de
// uma consulta por linha (a tela abre centenas de lancamentos de uma vez).
function shapeJoinedTransaction(r: Row): Row {
  return {
    id: r.id,
    accountId: r.accountId,
    categoryId: r.categoryId,
    description: r.description,
    amount: r.amount,
    date: r.date,
    isManual: bool(r.isManual),
    notes: r.notes,
    account: {
      id: r.accountId,
      entityId: r.a_entityId,
      name: r.a_name,
      type: r.a_type,
      institution: r.a_institution,
      balance: r.a_balance,
      currency: r.a_currency,
      pluggyItemId: r.a_pluggyItemId,
      pluggyAccountId: r.a_pluggyAccountId,
      isManual: bool(r.a_isManual),
      archived: bool(r.a_archived),
      entity: r.e_id
        ? { id: r.e_id, name: r.e_name, type: r.e_type, color: r.e_color }
        : null,
    },
    category: r.c_id
      ? { id: r.c_id, name: r.c_name, icon: r.c_icon, isIncome: bool(r.c_isIncome) }
      : null,
    createdBy: r.u_id ? { id: r.u_id, name: r.u_name } : null,
  };
}

export function listTransactions(filters: {
  entityId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  limit?: number;
}): Row[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (filters.accountId) {
    clauses.push("t.accountId = ?");
    params.push(filters.accountId);
  }
  if (filters.categoryId) {
    clauses.push("t.categoryId = ?");
    params.push(filters.categoryId);
  }
  if (filters.entityId) {
    clauses.push("a.entityId = ?");
    params.push(filters.entityId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  // O limite entra como parametro (nunca concatenado) e com teto, para uma
  // querystring maluca nao virar consulta gigante.
  const pedido = Number(filters.limit);
  const limit = Number.isFinite(pedido)
    ? Math.min(Math.max(Math.trunc(pedido), 1), 2000)
    : 300;
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT t.*,
              a.entityId AS a_entityId, a.name AS a_name, a.type AS a_type,
              a.institution AS a_institution, a.balance AS a_balance,
              a.currency AS a_currency, a.pluggyItemId AS a_pluggyItemId,
              a.pluggyAccountId AS a_pluggyAccountId, a.isManual AS a_isManual,
              a.archived AS a_archived,
              e.id AS e_id, e.name AS e_name, e.type AS e_type, e.color AS e_color,
              c.id AS c_id, c.name AS c_name, c.icon AS c_icon, c.isIncome AS c_isIncome,
              u.id AS u_id, u.name AS u_name
       FROM transactions t
       JOIN accounts a ON a.id = t.accountId
       LEFT JOIN entities e ON e.id = a.entityId
       LEFT JOIN categories c ON c.id = t.categoryId
       LEFT JOIN users u ON u.id = t.createdById
       ${where}
       ORDER BY t.date DESC
       LIMIT ?`
    )
    .all(...params) as Row[];
  return rows.map(shapeJoinedTransaction);
}

// Em conta manual (carteira, dinheiro em especie) o saldo so muda se a gente
// mexer nele: entao cada lancamento manual soma/subtrai do saldo da conta.
// Conta vinda da Pluggy nao entra aqui - o saldo dela vem do proprio banco.
function applyBalanceDelta(accountId: string, delta: number) {
  if (!delta) return;
  const account = db
    .prepare("SELECT isManual FROM accounts WHERE id = ?")
    .get(accountId) as Row | undefined;
  if (!account) throw new Error("Conta nao encontrada");
  if (!bool(account.isManual)) return;
  db.prepare(
    "UPDATE accounts SET balance = balance + ?, updatedAt = ? WHERE id = ?"
  ).run(delta, nowIso(), accountId);
}

export function createTransaction(t: {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}): Row {
  const id = newId();
  return inTransaction(() => {
    db.prepare(
      `INSERT INTO transactions (id, accountId, categoryId, description, amount, date, isManual, notes, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      id,
      t.accountId,
      t.categoryId ?? null,
      t.description,
      t.amount,
      new Date(t.date).toISOString(),
      t.notes ?? null,
      t.createdById ?? null,
      nowIso()
    );
    applyBalanceDelta(t.accountId, t.amount);
    return shapeTransaction(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Row);
  });
}

export function updateTransaction(id: string, patch: Row): Row {
  const cur = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Row;
  if (!cur) throw new Error("Transacao nao encontrada");
  const next = {
    description: patch.description ?? cur.description,
    amount: patch.amount === undefined ? cur.amount : patch.amount,
    date: patch.date ? new Date(patch.date).toISOString() : cur.date,
    categoryId: patch.categoryId === undefined ? cur.categoryId : patch.categoryId,
    notes: patch.notes === undefined ? cur.notes : patch.notes,
  };
  return inTransaction(() => {
    db.prepare(
      "UPDATE transactions SET description = ?, amount = ?, date = ?, categoryId = ?, notes = ? WHERE id = ?"
    ).run(next.description, next.amount, next.date, next.categoryId, next.notes, id);
    // So a diferenca entra no saldo (editar 50 para 70 mexe 20, nao 70).
    applyBalanceDelta(cur.accountId, next.amount - cur.amount);
    return shapeTransaction(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Row);
  });
}

// Usado no sync: cria/atualiza transacao pela pluggyTransactionId
export function upsertPluggyTransaction(t: {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  pluggyTransactionId: string;
}): void {
  const existing = db
    .prepare("SELECT id FROM transactions WHERE pluggyTransactionId = ?")
    .get(t.pluggyTransactionId) as Row | undefined;
  if (existing) {
    db.prepare(
      "UPDATE transactions SET description = ?, amount = ?, date = ?, categoryId = ? WHERE id = ?"
    ).run(t.description, t.amount, new Date(t.date).toISOString(), t.categoryId ?? null, existing.id);
    return;
  }
  db.prepare(
    `INSERT INTO transactions (id, accountId, categoryId, description, amount, date, pluggyTransactionId, isManual, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    newId(),
    t.accountId,
    t.categoryId ?? null,
    t.description,
    t.amount,
    new Date(t.date).toISOString(),
    t.pluggyTransactionId,
    nowIso()
  );
}
