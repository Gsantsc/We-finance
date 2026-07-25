// Helpers compartilhados pelas rotas de API.
//
// - requireSession: o middleware ja barra quem nao esta logado, mas as rotas
//   conferem de novo (se alguem mexer no matcher, a API nao fica aberta).
// - readJson / validate: todo corpo passa por um schema zod antes de chegar
//   no banco, para nao gravar valor quebrado (amount NaN, tipo inexistente...).
// - handle: converte erro em resposta JSON com status, em vez de estourar 500.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { ZodSchema } from "zod";
import { authOptions } from "./auth";
import { ApiError } from "./errors";

export { ApiError };

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new ApiError("Nao autenticado", 401);
  return session;
}

// Igual a requireSession, mas tambem resolve o household do usuario e barra
// quem ainda esta na senha padrao (deve trocar antes de mexer nos dados).
export async function requireHousehold() {
  const session = await requireSession();
  if (session.user.mustChangePassword) {
    throw new ApiError("Troque a senha temporaria antes de continuar.", 403);
  }
  const householdId = session.user.householdId;
  if (!householdId) throw new ApiError("Usuario sem casa associada.", 403);
  return { session, householdId };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError("Corpo invalido: era esperado um JSON.");
  }
}

export function validate<T>(schema: ZodSchema<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const detalhe = parsed.error.issues
    .map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`)
    .join("; ");
  throw new ApiError(`Dados invalidos - ${detalhe}`);
}

export async function handle(fn: () => Promise<unknown> | unknown) {
  try {
    return NextResponse.json(await fn());
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    // Erro inesperado: detalhe so no log do servidor. A mensagem crua pode
    // expor interna (nomes de tabela do Postgres, config) para o cliente.
    if (status === 500) {
      console.error(err);
      return NextResponse.json({ error: "Erro interno." }, { status: 500 });
    }
    return NextResponse.json({ error: err.message }, { status });
  }
}
