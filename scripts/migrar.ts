// Aplica as migracoes de supabase/migrations/ em ordem de nome.
//
// Ate aqui o schema foi evoluindo direto no painel do Supabase, sem historico
// versionado - o que torna impossivel recriar o banco ou saber o que ja subiu.
// Este runner resolve isso: cada arquivo .sql roda UMA vez, dentro de uma
// transacao, e fica registrado em schema_migrations.
//
//   npm run migrar          aplica o que falta
//   npm run migrar -- --dry mostra o que falta, sem aplicar
//
// As migracoes devem ser idempotentes mesmo assim (if not exists / drop if
// exists), para o caso de o objeto ja ter sido criado a mao no painel.

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DIR = join(process.cwd(), "supabase", "migrations");
const dryRun = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao definida (confira o .env).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version     text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const aplicadas = new Set(
    (await sql<{ version: string }[]>`SELECT version FROM public.schema_migrations`).map(
      (r) => r.version
    )
  );

  const arquivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pendentes = arquivos.filter((f) => !aplicadas.has(f));

  if (pendentes.length === 0) {
    console.log(`Nada a aplicar (${aplicadas.size} migracao(oes) ja no banco).`);
    return;
  }

  console.log(`${pendentes.length} pendente(s): ${pendentes.join(", ")}`);
  if (dryRun) return;

  for (const arquivo of pendentes) {
    const conteudo = readFileSync(join(DIR, arquivo), "utf8");
    process.stdout.write(`  aplicando ${arquivo} ... `);
    try {
      // begin() garante tudo-ou-nada: um erro no meio nao deixa meia migracao.
      await sql.begin(async (tx) => {
        // O timeout padrao do pooler derruba DDL que precisa esperar lock:
        // recriar uma view enquanto o app le dela ja bastou para falhar. O
        // lock_timeout separado evita ficar preso indefinidamente atras de uma
        // conexao esquecida - falha rapido e avisa em vez de travar.
        await tx`SET LOCAL statement_timeout = '120s'`;
        await tx`SET LOCAL lock_timeout = '15s'`;
        await tx.unsafe(conteudo);
        await tx`INSERT INTO public.schema_migrations (version) VALUES (${arquivo})`;
      });
      console.log("ok");
    } catch (err) {
      console.log("FALHOU");
      console.error(err);
      process.exitCode = 1;
      return;
    }
  }

  console.log("Migracoes aplicadas.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
