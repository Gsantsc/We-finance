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
  resumoDoMes,
} from "./rules";
import { calculatePatrimony, type PatrimonyBreakdown } from "./patrimonio";
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

// ---------- LGPD: portabilidade e exclusao ----------

// Tudo que a casa tem, num objeto so, para o usuario baixar. Portabilidade
// (art. 18, V) pede formato legivel por maquina - JSON resolve.
//
// Escopo e' a CASA, nao a pessoa: as duas compartilham o mesmo ledger e separar
// "meus" lancamentos dos "dela" nao faria sentido num app feito para casal.
export async function exportarDadosDaCasa(householdId: string): Promise<Row> {
  const [casa, membros, entidades, contas, transacoes, metas, aportes, contasAPagar, orcamentos, regras, lotes] =
    await Promise.all([
      sql`SELECT id, name, created_at FROM households WHERE id = ${householdId}`,
      sql`SELECT u.id, u.name, u.email, u.created_at, hm.role, hm.joined_at
          FROM users u JOIN household_members hm ON hm.user_id = u.id
          WHERE hm.household_id = ${householdId}`,
      sql`SELECT * FROM entities WHERE household_id = ${householdId}`,
      sql`SELECT * FROM accounts WHERE household_id = ${householdId}`,
      sql`SELECT t.* FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          WHERE a.household_id = ${householdId} ORDER BY t.date`,
      sql`SELECT * FROM goals WHERE household_id = ${householdId}`,
      sql`SELECT * FROM goal_contributions WHERE household_id = ${householdId} ORDER BY date`,
      sql`SELECT * FROM bills WHERE household_id = ${householdId}`,
      sql`SELECT * FROM budgets WHERE household_id = ${householdId}`,
      sql`SELECT * FROM categorization_rules WHERE household_id = ${householdId}`,
      sql`SELECT * FROM import_batches WHERE household_id = ${householdId}`,
    ]);

  return {
    exportadoEm: new Date().toISOString(),
    formato: "we-finance/v1",
    // password_hash NUNCA entra: e' segredo de autenticacao, nao dado do titular.
    casa: casa[0] ?? null,
    membros,
    entidades,
    contas,
    transacoes,
    metas,
    aportesDeMetas: aportes,
    contasAPagar,
    orcamentos,
    regrasDeCategorizacao: regras,
    lotesDeImportacao: lotes,
  };
}

// Apaga a casa inteira e quem so pertence a ela.
//
// Nao e' "marcar como inativo": o titular pediu exclusao (art. 18, VI) e o dado
// sai do banco. A ordem respeita as FKs; users vai por ultimo, e so os membros
// desta casa - alguem que por algum motivo esteja em outra casa fica de pe.
export async function excluirCasaEDados(householdId: string): Promise<Row> {
  return inTransaction(async (tx) => {
    const membros = await tx`
      SELECT user_id FROM household_members WHERE household_id = ${householdId}
    `;
    const ids = membros.map((m) => m.user_id as string);

    const contagem: Record<string, number> = {};
    const apagar = async (rotulo: string, q: Promise<any>) => {
      const r = await q;
      contagem[rotulo] = r.count ?? 0;
    };

    await apagar("transacoes", tx`
      DELETE FROM transactions WHERE account_id IN (
        SELECT id FROM accounts WHERE household_id = ${householdId}
      )`);
    await apagar("aportes", tx`DELETE FROM goal_contributions WHERE household_id = ${householdId}`);
    await apagar("lotes", tx`DELETE FROM import_batches WHERE household_id = ${householdId}`);
    await apagar("orcamentos", tx`DELETE FROM budgets WHERE household_id = ${householdId}`);
    await apagar("contasAPagar", tx`DELETE FROM bills WHERE household_id = ${householdId}`);
    await apagar("metas", tx`DELETE FROM goals WHERE household_id = ${householdId}`);
    await apagar("regras", tx`DELETE FROM categorization_rules WHERE household_id = ${householdId}`);
    await apagar("contas", tx`DELETE FROM accounts WHERE household_id = ${householdId}`);
    await apagar("entidades", tx`DELETE FROM entities WHERE household_id = ${householdId}`);
    await apagar("vinculos", tx`DELETE FROM household_members WHERE household_id = ${householdId}`);
    await apagar("casa", tx`DELETE FROM households WHERE id = ${householdId}`);

    if (ids.length > 0) {
      // So remove quem nao sobrou em nenhuma outra casa.
      await tx`DELETE FROM password_reset_tokens WHERE user_id = ANY(${ids})`;
      await tx`DELETE FROM email_verification_tokens WHERE user_id = ANY(${ids})`;
      const r = await tx`
        DELETE FROM users WHERE id = ANY(${ids})
          AND id NOT IN (SELECT user_id FROM household_members)
      `;
      contagem.usuarios = r.count ?? 0;
    }

    return contagem;
  });
}

// ---------- Recuperacao de senha ----------

// Janela curta de proposito: o link chega por email e da acesso total a conta.
const RESET_VALIDO_MS = 60 * 60 * 1000; // 1 hora

// Cria o token e INVALIDA os anteriores do mesmo usuario. Sem isso, pedir o
// link tres vezes deixa tres chaves validas circulando em tres emails.
export async function createPasswordResetToken(
  userId: string,
  ip?: string | null
): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const ts = nowIso();
  await inTransaction(async (tx) => {
    await tx`UPDATE password_reset_tokens SET used_at = ${ts}
             WHERE user_id = ${userId} AND used_at IS NULL`;
    await tx`INSERT INTO password_reset_tokens
             (id, user_id, token_hash, expires_at, created_at, requested_ip)
             VALUES (${newId()}, ${userId}, ${tokenHash},
                     ${new Date(Date.now() + RESET_VALIDO_MS).toISOString()}, ${ts}, ${ip ?? null})`;
  });
  return rawToken;
}

// Troca a senha e queima o token. Devolve null para token inexistente, expirado
// ou ja usado - a rota nao distingue os casos para nao virar oraculo.
export async function consumePasswordResetToken(
  rawToken: string,
  passwordHash: string
): Promise<Row | null> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return inTransaction(async (tx) => {
    const [row] = await tx`
      SELECT * FROM password_reset_tokens WHERE token_hash = ${tokenHash}
    `;
    if (!row || row.used_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;

    const ts = nowIso();
    await tx`UPDATE password_reset_tokens SET used_at = ${ts} WHERE id = ${row.id}`;
    // must_change_password sai junto: quem acabou de escolher a senha nao pode
    // cair na tela de troca obrigatoria logo depois.
    await tx`UPDATE users
             SET password_hash = ${passwordHash}, must_change_password = false,
                 email_verified_at = COALESCE(email_verified_at, ${ts})
             WHERE id = ${row.user_id}`;
    const [user] = await tx`SELECT * FROM users WHERE id = ${row.user_id}`;
    return user ? shapeUser(user) : null;
  });
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

// 8 bytes = 64 bits. Os 4 bytes originais davam 32 bits, e quem adivinha um
// codigo entra numa casa e ve o dinheiro inteiro dela - nao e' um identificador
// qualquer, e' credencial de acesso.
function generateInviteCode(): string {
  return randomBytes(8).toString("hex");
}

// Troca o codigo da casa. Existe para o caso de o link ter sido compartilhado
// no grupo errado: o antigo para de valer na hora.
export async function regenerateInviteCode(householdId: string): Promise<string> {
  let code = generateInviteCode();
  while ((await sql`SELECT 1 FROM households WHERE invite_code = ${code}`).length > 0) {
    code = generateInviteCode();
  }
  await sql`UPDATE households SET invite_code = ${code} WHERE id = ${householdId}`;
  return code;
}

export async function countHouseholdMembers(householdId: string): Promise<number> {
  const [r] = await sql`
    SELECT count(*)::int n FROM household_members WHERE household_id = ${householdId}
  `;
  return Number(r.n);
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
  if (!row) throw new ApiError("Usuário não encontrado nesta casa", 404);
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
  if (!cur) throw new ApiError("Entidade não encontrada", 404);
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
  if (!row) throw new ApiError("Entidade não encontrada", 404);
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
  if (!cur) throw new ApiError("Conta não encontrada", 404);
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

// Casa SEM ACENTO de proposito. Com comparacao exata, "Salario" e "Salário"
// viram duas categorias: o seed recriaria as versoes sem acento que a migracao
// 0007 acabou de corrigir, e o sync da Pluggy (que passa o nome vindo da API
// deles) multiplicaria variante a cada grafia diferente.
export async function upsertCategoryByName(name: string, icon = "💸", isIncome = false): Promise<Row> {
  const [existing] = await sql`
    SELECT * FROM categories WHERE public.sem_acento(name) = public.sem_acento(${name})
  `;
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
  if (!row) throw new ApiError("Conta não encontrada", 404);
}

// Em conta manual o saldo muda a cada lancamento; delta em CENTAVOS (com sinal).
// Conta da Pluggy nao entra aqui - o saldo dela vem do proprio banco.
async function applyBalanceDelta(tx: postgres.TransactionSql, accountId: string, deltaCents: number) {
  if (!deltaCents) return;
  const [account] = await tx`SELECT is_manual FROM accounts WHERE id = ${accountId}`;
  if (!account) throw new ApiError("Conta não encontrada", 404);
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
  interestRateBps?: number | null;
  creditor?: string | null;
}): Promise<{ groupId: string; count: number; installmentCents: number[]; totalCents: number }> {
  await assertAccountInHousehold(householdId, t.accountId);
  const n = Math.max(2, Math.min(360, Math.trunc(t.installments)));
  const groupId = newId();
  const parts = installmentPlanCents(toCents(Math.abs(t.amount)), n, t.mode);
  const baseDate = toDateOnly(t.date);
  const categoryId = t.categoryId ?? (await ruleCategoryFor(householdId, t.description));
  const totalCents = parts.reduce((s, x) => s + x, 0);
  const primeiroMes = baseDate.slice(0, 7);

  await inTransaction(async (tx) => {
    for (let i = 0; i < n; i++) {
      await tx`INSERT INTO transactions
        (id, account_id, category_id, description, type, amount_cents, date, source, installment_group_id, installment_number, installment_total, is_manual, created_by_id, created_at)
        VALUES (${newId()}, ${t.accountId}, ${categoryId}, ${t.description}, 'expense', ${parts[i]}, ${addMonths(baseDate, i)}, 'manual', ${groupId}, ${i + 1}, ${n}, true, ${t.createdById ?? null}, ${nowIso()})`;
    }
    // O plano descreve o ACORDO; as parcelas continuam sendo lancamentos comuns.
    // Sem ele, juros e credor teriam que ser repetidos nas N linhas e "quanto
    // ainda devo" exigiria varrer todas elas (ver v_installment_debt).
    await tx`INSERT INTO installment_plans
      (id, household_id, group_id, descricao, modo, installment_cents, total_cents,
       installments_total, first_month, last_month, interest_rate_bps, creditor,
       category_id, account_id, created_by_id)
      VALUES (${newId()}, ${householdId}, ${groupId}, ${t.description}, ${t.mode},
              ${parts[0]}, ${totalCents}, ${n}, ${primeiroMes}, ${addMonthKey(primeiroMes, n - 1)},
              ${t.interestRateBps ?? null}, ${t.creditor ?? null},
              ${categoryId}, ${t.accountId}, ${t.createdById ?? null})`;
  });

  return { groupId, count: n, installmentCents: parts, totalCents };
}

export async function updateTransaction(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`
    SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${id} AND a.household_id = ${householdId}
  `;
  if (!cur) throw new ApiError("Transação não encontrada", 404);
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
  if (!cat) throw new ApiError("Categoria não encontrada", 404);
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
        VALUES (${newId()}, ${id}, ${householdId}, ${inicial}, ${dataDeHojeSP()}, 'Saldo informado na criação da meta')`;
    }
  });
  const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
  return shapeGoal(row);
}

export async function updateGoal(householdId: string, id: string, patch: Row): Promise<Row> {
  const [cur] = await sql`SELECT * FROM goals WHERE id = ${id} AND household_id = ${householdId}`;
  if (!cur) throw new ApiError("Meta não encontrada", 404);
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
  if (!goal) throw new ApiError("Meta não encontrada", 404);

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

// Projecao dos meses FUTUROS: so o que ja e' compromisso assumido.
//
// Nao ha chute de receita aqui. Projetar entrada exigiria supor que o salario se
// repete, e uma linha inventada num grafico de dinheiro e' pior que uma linha
// ausente. As parcelas ja existem como lancamentos com data futura (o
// parcelamento gera as N linhas de uma vez); as contas fixas recorrentes nao
// sao lancamento, entao sao somadas mes a mes.
export async function projecaoMeses(
  householdId: string,
  mesBase: string,
  quantos = 6
): Promise<Row[]> {
  const n = Math.min(Math.max(quantos, 0), 24);
  if (n === 0) return [];

  const ultimo = addMonthKey(mesBase, n);
  const [parcelas, bills] = await Promise.all([
    sql`
      SELECT month, sum(amount_cents) FILTER (WHERE type = 'expense')::bigint AS saidas
      FROM v_transaction_scope
      WHERE household_id = ${householdId} AND month > ${mesBase} AND month <= ${ultimo}
      GROUP BY month
    `,
    sql`SELECT coalesce(sum(amount), 0)::bigint AS cents FROM bills
        WHERE household_id = ${householdId} AND recurring = true`,
  ]);

  const porMes = new Map(parcelas.map((r) => [r.month as string, Number(r.saidas ?? 0)]));
  const fixasCents = Number(bills[0]?.cents ?? 0);

  const serie: Row[] = [];
  for (let i = 1; i <= n; i++) {
    const m = addMonthKey(mesBase, i);
    const saidas = (porMes.get(m) ?? 0) + fixasCents;
    serie.push({
      month: m,
      receitas: 0,
      despesas: toReais(saidas),
      liquido: toReais(-saidas),
      projetado: true,
    });
  }
  return serie;
}

// ---------- Contas a pagar ----------

// Materializa as contas fixas do mes como lancamento.
//
// A recorrencia (bills) e' o MOLDE; o lancamento e' o FATO. Sem gerar a linha,
// "paguei o aluguel de agosto" nao existiria como fato - so um last_paid_at que
// guardava um pagamento e esquecia o historico.
//
// IDEMPOTENTE: o indice unico (bill_id, mes) segura a segunda tentativa, entao
// abrir o mesmo mes duas vezes nao duplica nada. E' por isso que da para chamar
// isto na leitura da tela sem medo.
export async function gerarContasFixasDoMes(householdId: string, month: string): Promise<number> {
  const bills = await sql`
    SELECT b.*, coalesce(b.account_id, (
      SELECT a.id FROM accounts a
      WHERE a.household_id = ${householdId} AND a.archived = false
      ORDER BY a.created_at ASC LIMIT 1
    )) AS conta_destino
    FROM bills b
    WHERE b.household_id = ${householdId}
      AND b.ativa = true
      AND (b.inicio IS NULL OR b.inicio <= ${month})
      AND (b.fim IS NULL OR b.fim >= ${month})
  `;
  if (bills.length === 0) return 0;

  const [ano, mes] = month.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let criadas = 0;

  for (const b of bills) {
    if (!b.conta_destino) continue; // casa sem conta ainda: nao ha onde lancar
    // Vencimento dia 31 num mes de 30 cai no ultimo dia, nao vira o mes.
    const dia = String(Math.min(Number(b.due_day), diasNoMes)).padStart(2, "0");
    const data = `${month}-${dia}`;
    const r = await sql`
      INSERT INTO transactions
        (id, account_id, category_id, description, type, amount_cents, date, due_date,
         source, bill_id, is_manual, created_at)
      VALUES (${newId()}, ${b.conta_destino}, ${b.category_id ?? null}, ${b.name}, 'expense',
              ${Number(b.amount)}, ${data}, ${data}, 'recurring', ${b.id}, true, ${nowIso()})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (r.length > 0) criadas++;
  }
  return criadas;
}

export type FiltroContas = {
  status?: string | null;
  categoriaId?: string | null;
  donoId?: string | null;
};

export async function contasAPagarDoMes(
  householdId: string,
  month: string,
  filtros: FiltroContas = {}
): Promise<Row> {
  await gerarContasFixasDoMes(householdId, month);

  const linhas = await sql`
    SELECT * FROM v_contas_a_pagar
    WHERE household_id = ${householdId} AND competencia = ${month}
    ORDER BY vencimento ASC, descricao ASC
  `;

  const itens = linhas
    .filter((l) => (filtros.status ? l.status === filtros.status : true))
    .filter((l) => (filtros.categoriaId ? l.category_id === filtros.categoriaId : true))
    .filter((l) =>
      filtros.donoId
        ? filtros.donoId === "compartilhado"
          ? l.owner_id === null
          : l.owner_id === filtros.donoId
        : true
    )
    .map((l) => ({
      id: l.id,
      descricao: l.descricao,
      valor: toReais(Number(l.amount_cents)),
      vencimento: l.vencimento,
      pagoEm: l.paid_at,
      status: l.status as "pago" | "atrasado" | "em_aberto",
      origem: l.origem as "recorrente" | "emprestimo" | "parcela" | "avulsa",
      categoria: l.categoria,
      categoriaIcone: l.categoria_icone,
      categoriaId: l.category_id,
      conta: l.conta,
      dono: l.dono,
      donoId: l.owner_id,
      parcela: l.installment_number,
      parcelaTotal: l.installment_total,
      groupId: l.installment_group_id,
      billId: l.bill_id,
    }));

  // Os totais sao do MES INTEIRO, nao do filtro: quem filtra por "atrasado"
  // ainda precisa saber quanto e' o mes todo, senao o resumo mente.
  const todas = linhas;
  const soma = (f: (l: Row) => boolean) =>
    toReais(todas.filter(f).reduce((s, l) => s + Number(l.amount_cents), 0));

  return {
    month,
    itens,
    resumo: {
      total: soma(() => true),
      pago: soma((l) => l.status === "pago"),
      emAberto: soma((l) => l.status === "em_aberto"),
      atrasado: soma((l) => l.status === "atrasado"),
      quantidade: todas.length,
    },
  };
}

// Marca/desmarca pagamento. Mexer no saldo aqui seria dobrar o efeito: o
// lancamento ja debitou a conta quando foi criado.
export async function marcarPagamento(
  householdId: string,
  id: string,
  pago: boolean,
  data?: string | null
): Promise<Row> {
  const [atual] = await sql`
    SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${id} AND a.household_id = ${householdId}
  `;
  if (!atual) throw new ApiError("Lançamento não encontrado", 404);

  const quando = pago ? toDateOnly(data ?? dataDeHojeSP()) : null;
  await sql`UPDATE transactions SET paid_at = ${quando} WHERE id = ${id}`;

  // bills.last_paid_at continua alimentado para o sino de avisos, que ainda le
  // dali. E' espelho, nao fonte.
  const [linha] = await sql`SELECT bill_id FROM transactions WHERE id = ${id}`;
  if (linha?.bill_id) {
    await sql`UPDATE bills SET last_paid_at = ${quando} WHERE id = ${linha.bill_id}`;
  }
  return { id, pagoEm: quando };
}

// Editar uma parcela: "so esta" ou "esta e as futuras".
//
// A escolha existe porque as duas sao legitimas e opostas: corrigir o valor
// digitado errado num emprestimo de 48x deve valer para as 48; ja um mes em que
// a fatura veio diferente vale so para aquele. Sem a pergunta, uma das duas
// exigiria repetir a edicao dezenas de vezes.
//
// "Futuras" e' por DATA, nao por numero da parcela: parcela ja paga nao deve ser
// reescrita, e o que importa e' o que ainda esta por vir.
export async function editarLancamento(
  householdId: string,
  patch: {
    id: string;
    escopo?: "so_esta" | "esta_e_futuras";
    description?: string;
    amount?: number;
    dueDate?: string;
    categoryId?: string | null;
  }
): Promise<{ alterados: number }> {
  const [atual] = await sql`
    SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${patch.id} AND a.household_id = ${householdId}
  `;
  if (!atual) throw new ApiError("Lançamento não encontrado", 404);

  const emGrupo = Boolean(atual.installment_group_id);
  const futuras = patch.escopo === "esta_e_futuras" && emGrupo;

  const cents = patch.amount === undefined ? null : toCents(Math.abs(patch.amount));
  const alvo = futuras
    ? await sql`SELECT id FROM transactions
                WHERE installment_group_id = ${atual.installment_group_id}
                  AND date >= ${atual.date}`
    : [{ id: atual.id }];

  await inTransaction(async (tx) => {
    for (const linha of alvo) {
      await tx`
        UPDATE transactions SET
          description = ${patch.description ?? atual.description},
          amount_cents = ${cents ?? Number(atual.amount_cents)},
          category_id  = ${patch.categoryId === undefined ? atual.category_id : patch.categoryId},
          due_date     = ${
            // O vencimento so se move na linha editada: aplicar a mesma data em
            // todas empilharia o parcelamento inteiro num mes so.
            linha.id === atual.id ? (patch.dueDate ? toDateOnly(patch.dueDate) : atual.due_date) : sql`due_date`
          }
        WHERE id = ${linha.id}
      `;
    }
    if (futuras && cents !== null) {
      await tx`UPDATE installment_plans SET installment_cents = ${cents}
               WHERE group_id = ${atual.installment_group_id}`;
    }
  });

  return { alterados: alvo.length };
}

export async function excluirLancamento(
  householdId: string,
  id: string,
  escopo?: "so_esta" | "esta_e_futuras"
): Promise<{ removidos: number }> {
  const [atual] = await sql`
    SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ${id} AND a.household_id = ${householdId}
  `;
  if (!atual) throw new ApiError("Lançamento não encontrado", 404);

  const futuras = escopo === "esta_e_futuras" && Boolean(atual.installment_group_id);
  const alvo = futuras
    ? await sql`SELECT id FROM transactions
                WHERE installment_group_id = ${atual.installment_group_id}
                  AND date >= ${atual.date}`
    : [{ id: atual.id }];

  await inTransaction(async (tx) => {
    for (const linha of alvo) {
      // Devolve ao saldo o que o lancamento tirou. Parcela nunca mexeu no saldo
      // (competencia futura), entao so o lancamento avulso precisa do estorno.
      if (!atual.installment_group_id) {
        const sinal = atual.type === "expense" ? 1 : -1;
        await applyBalanceDelta(tx, atual.account_id, sinal * Number(atual.amount_cents));
      }
      await tx`DELETE FROM transactions WHERE id = ${linha.id}`;
    }
  });

  return { removidos: alvo.length };
}

// Projecao dos proximos meses: quando as parcelas acabam e quanto pesa ate la.
export async function projecaoContasAPagar(
  householdId: string,
  mesBase: string,
  meses = 12
): Promise<Row[]> {
  const n = Math.min(Math.max(meses, 1), 24);
  const ultimo = addMonthKey(mesBase, n);

  const [parcelas, bills] = await Promise.all([
    sql`
      SELECT substr(t.date, 1, 7) AS mes, sum(t.amount_cents)::bigint AS cents
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE a.household_id = ${householdId} AND t.type = 'expense'
        AND t.bill_id IS NULL
        AND substr(t.date, 1, 7) > ${mesBase} AND substr(t.date, 1, 7) <= ${ultimo}
      GROUP BY 1
    `,
    sql`SELECT name, amount, inicio, fim FROM bills
        WHERE household_id = ${householdId} AND ativa = true`,
  ]);

  const porMes = new Map(parcelas.map((r) => [r.mes as string, Number(r.cents)]));

  return Array.from({ length: n }, (_, i) => {
    const m = addMonthKey(mesBase, i + 1);
    const fixasCents = bills
      .filter((b) => (!b.inicio || b.inicio <= m) && (!b.fim || b.fim >= m))
      .reduce((s, b) => s + Number(b.amount), 0);
    const parcelasCents = porMes.get(m) ?? 0;
    return {
      month: m,
      fixas: toReais(fixasCents),
      parcelas: toReais(parcelasCents),
      total: toReais(fixasCents + parcelasCents),
    };
  });
}

// ---------- Patrimonio ----------

// Busca os tres lados do patrimonio e delega a CONTA para calculatePatrimony,
// que e' pura e testada. Aqui so tem I/O.
export async function patrimonioDaCasa(householdId: string): Promise<PatrimonyBreakdown> {
  const [contas, parcelamentos, bills] = await Promise.all([
    sql`SELECT id, name, type, balance FROM accounts
        WHERE household_id = ${householdId} AND archived = false`,
    sql`SELECT group_id, descricao, installment_cents, parcelas_restantes
        FROM v_installment_debt WHERE household_id = ${householdId}`,
    // So conta fixa AINDA NAO paga neste mes e' compromisso.
    sql`SELECT id, name, amount, last_paid_at FROM bills WHERE household_id = ${householdId}`,
  ]);

  const mesCorrente = mesDeHojeSP();

  return calculatePatrimony({
    contas: contas.map((c) => ({
      id: c.id,
      nome: c.name,
      tipo: c.type,
      saldoCents: Number(c.balance),
    })),
    parcelamentos: parcelamentos.map((p) => ({
      groupId: p.group_id,
      descricao: p.descricao,
      parcelaCents: Number(p.installment_cents),
      parcelasRestantes: Number(p.parcelas_restantes),
    })),
    contasFixas: bills
      .filter((b) => String(b.last_paid_at ?? "").slice(0, 7) !== mesCorrente)
      .map((b) => ({ id: b.id, nome: b.name, valorCents: Number(b.amount) })),
  });
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
      projetado: false,
    });
  }
  return serie;
}

// Payload unico do dashboard de um mes. Uma chamada, tudo ja agregado no banco.
export async function dashboardMonth(householdId: string, month: string): Promise<Row> {
  const [overviewRows, categorias, metasRows, billRows, aporteRows, contas, evolucao, projecao, meses, ultimos, patrimonio] =
    await Promise.all([
      sql`
        SELECT o.*, u.name AS owner_name
        FROM v_monthly_overview o
        LEFT JOIN users u ON u.id = o.owner_id
        WHERE o.household_id = ${householdId} AND o.month = ${month}
      `,
      sql`
        -- A view quebra por DONO, entao a mesma categoria vem uma vez por
        -- pessoa. Sem este group by, "Alimentação" aparecia duas vezes na lista
        -- (e com chave React repetida), cada uma com um pedaco do gasto, em vez
        -- de uma linha com o total da casa.
        SELECT category_id,
               max(category_name) AS category_name,
               max(category_icon) AS category_icon,
               sum(total_cents)::bigint AS total_cents
        FROM v_monthly_category_totals
        WHERE household_id = ${householdId} AND month = ${month} AND type = 'expense'
        GROUP BY category_id
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
      monthlyEvolution(householdId, month, 12),
      projecaoMeses(householdId, month, 6),
      availableMonths(householdId),
      // Do MES selecionado - a lista fica embaixo do seletor, ignorar o filtro
      // ali seria mostrar lancamento de outro mes sob o rotulo deste.
      listTransactions(householdId, { month, limit: 8 }),
      patrimonioDaCasa(householdId),
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
    const salario = toReais(Number(r.salary_cents));
    const va = toReais(Number(r.va_cents));
    const vr = toReais(Number(r.vr_cents));
    const investido = toReais(Number(r.invested_cents));
    const parcelas = toReais(Number(r.installments_cents));

    // A algebra vive em rules.ts, testada: entrou - saiu - guardado tem que dar
    // o mesmo que receitas - despesas - contasFixas - aportes.
    const { outrasEntradas, outrosGastos, entrou, saiu, guardado, sobra } = resumoDoMes({
      receitas,
      despesas,
      salario,
      va,
      vr,
      investido,
      parcelas,
      contasFixas,
      aportes: aportesReais,
    });

    return {
      key: total ? "casal" : (ownerId ?? "compartilhado"),
      nome: total ? "Casal" : (r.owner_name ?? "Compartilhado"),
      isTotal: total,
      salario,
      va,
      vr,
      outrasEntradas,
      parcelas,
      contasFixas,
      outrosGastos,
      dividas: parcelas + contasFixas,
      investido,
      aportes: aportesReais,
      entrou,
      saiu,
      guardado,
      receitas,
      despesas,
      sobra,
    };
  });

  // "Compartilhado" (entidades sem dono) so faz sentido AO LADO de pelo menos
  // uma pessoa. Sem nenhum dono definido, ele fica identico ao total e a tela
  // mostra duas colunas com os mesmos numeros, sugerindo uma divisao que nao
  // existe. Nesse caso o total do casal ja conta a historia inteira.
  const temPessoa = colunas.some((c) => !c.isTotal && c.key !== "compartilhado");
  const visiveis = temPessoa ? colunas : colunas.filter((c) => c.isTotal);

  // Casal primeiro, depois as pessoas por nome, e o "Compartilhado" por ultimo.
  visiveis.sort((a, b) => {
    if (a.isTotal !== b.isTotal) return a.isTotal ? -1 : 1;
    if (a.key === "compartilhado") return 1;
    if (b.key === "compartilhado") return -1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return {
    month,
    mesesDisponiveis: meses,
    colunas: visiveis,
    evolucao: [...evolucao, ...projecao],
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
      // Soma bruta dos saldos. O patrimonio LIQUIDO (com passivos) vem em
      // `patrimonio`, logo abaixo - este numero fica so como referencia do
      // quanto existe em conta.
      saldoEmContas: toReais(contas.reduce((s, c) => s + Number(c.cents), 0)),
      investimentos: toReais(
        contas.filter((c) => c.type === "INVESTIMENTO").reduce((s, c) => s + Number(c.cents), 0)
      ),
      total: contas.reduce((s, c) => s + c.n, 0),
      semEntidade: contas.reduce((s, c) => s + c.sem_entidade, 0),
    },
    // Patrimonio LIQUIDO com o detalhamento item a item, para o card poder ser
    // auditado sem sair da tela. Em reais na borda, como o resto da API.
    patrimonio: {
      ativos: toReais(patrimonio.ativosCents),
      passivos: toReais(patrimonio.passivosCents),
      liquido: toReais(patrimonio.liquidoCents),
      itensAtivos: patrimonio.ativos.map((i) => ({
        rotulo: i.rotulo,
        valor: toReais(i.valorCents),
        detalhe: i.detalhe ?? null,
      })),
      itensPassivos: patrimonio.passivos.map((i) => ({
        rotulo: i.rotulo,
        valor: toReais(i.valorCents),
        detalhe: i.detalhe ?? null,
      })),
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
  if (!row) throw new ApiError("Aporte não encontrado", 404);
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
  if (!cur) throw new ApiError("Conta a pagar não encontrada", 404);
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
