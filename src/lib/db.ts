// Camada de dados usando o SQLite embutido do Node (node:sqlite).
// Zero dependencias nativas / downloads: funciona em qualquer maquina com Node 22+.
//
// O banco fica em um unico arquivo (por padrao ./data/app.db). Basta copiar
// esse arquivo para fazer backup de tudo.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

function defaultDbPath(): string {
  // Por padrao o banco fica FORA de pastas sincronizadas na nuvem. Este projeto
  // costuma ficar dentro do OneDrive; deixar o SQLite (em modo WAL, escrevendo o
  // tempo todo com o servidor ligado) sincronizar para a nuvem pode corromper o
  // arquivo. No Windows usamos a pasta de dados do usuario; nos demais sistemas
  // (e no Docker, que define DATABASE_PATH), seguimos com a pasta data/.
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "nossas-financas", "app.db");
  }
  return path.join(process.cwd(), "data", "app.db");
}

// Move um banco que ja exista na antiga pasta data/ para o novo local padrao,
// sem perder nada. So age quando: nao ha DATABASE_PATH definido, o banco novo
// ainda nao existe, e existe um banco antigo. Nunca sobrescreve.
function migrarBancoAntigoSePreciso(fromEnv: string | undefined, destino: string) {
  if (fromEnv && fromEnv.trim().length > 0) return;
  const antigo = path.join(process.cwd(), "data", "app.db");
  if (path.resolve(antigo) === path.resolve(destino)) return;
  if (fs.existsSync(destino)) return;
  if (!fs.existsSync(antigo)) return;

  // Move o banco e os arquivos auxiliares do WAL juntos (o -wal pode conter
  // dados ainda nao gravados no arquivo principal).
  for (const sufixo of ["", "-wal", "-shm"]) {
    const de = antigo + sufixo;
    const para = destino + sufixo;
    if (!fs.existsSync(de)) continue;
    try {
      fs.renameSync(de, para);
    } catch {
      fs.copyFileSync(de, para);
      try { fs.rmSync(de); } catch {}
    }
  }
  console.log(`[nossas-financas] Banco movido para fora do OneDrive: ${destino}`);
}

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  const file = fromEnv && fromEnv.trim().length > 0 ? fromEnv : defaultDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  migrarBancoAntigoSePreciso(fromEnv, file);
  return file;
}

const globalForDb = globalThis as unknown as { _db?: DatabaseSync };

function createDb(): DatabaseSync {
  const db = new DatabaseSync(resolveDbPath());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export const db: DatabaseSync = globalForDb._db ?? createDb();
if (!globalForDb._db) globalForDb._db = db;

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      ownerId TEXT,
      color TEXT NOT NULL DEFAULT '#6366f1',
      archived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      entityId TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      institution TEXT,
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'BRL',
      pluggyItemId TEXT,
      pluggyAccountId TEXT UNIQUE,
      isManual INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (entityId) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '💸',
      isIncome INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      categoryId TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      pluggyTransactionId TEXT UNIQUE,
      isManual INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      createdById TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES categories(id),
      FOREIGN KEY (createdById) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      entityId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE (entityId, categoryId, month, year),
      FOREIGN KEY (entityId) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      entityId TEXT NOT NULL,
      name TEXT NOT NULL,
      targetAmount REAL NOT NULL,
      currentAmount REAL NOT NULL DEFAULT 0,
      targetDate TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (entityId) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      entityId TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      dueDay INTEGER NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 1,
      lastPaidAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (entityId) REFERENCES entities(id) ON DELETE CASCADE
    );
  `);
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
