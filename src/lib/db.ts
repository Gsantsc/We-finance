// Camada de dados usando o SQLite embutido do Node (node:sqlite).
// Zero dependencias nativas / downloads: funciona em qualquer maquina com Node 22+.
//
// O banco fica em um unico arquivo (por padrao ./data/app.db). Basta copiar
// esse arquivo para fazer backup de tudo.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  const file = fromEnv && fromEnv.trim().length > 0
    ? fromEnv
    : path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
