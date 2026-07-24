// Camada de dados usando Postgres (Supabase). Conexao unica reaproveitada
// entre requests (serverless-friendly), lida da DATABASE_URL.
//
// Schema e migrations vivem no Supabase (nao rodamos migration no boot como
// fazia o SQLite local) - ver supabase/migrations/ para o histórico aplicado.

import postgres from "postgres";
import { randomUUID } from "node:crypto";

// A connection string so e' lida de verdade na primeira query (postgres.js
// conecta sob demanda) - assim o build/typecheck nao quebra so por faltar
// DATABASE_URL no ambiente que empacota o codigo.
const globalForDb = globalThis as unknown as { _sql?: postgres.Sql };

export const sql: postgres.Sql =
  globalForDb._sql ?? postgres(process.env.DATABASE_URL ?? "", { ssl: "require" });
if (!globalForDb._sql) globalForDb._sql = sql;

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
