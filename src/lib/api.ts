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
import { ApiError, corpoDeErro } from "./errors";

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
  throw new ApiError(`Dados invalidos - ${detalhe}`, 400, "VALIDACAO");
}

// Ponto unico de saida das rotas: sucesso vira JSON, erro vira { code, message }
// com o status certo. Nada alem disso chega ao cliente - stack e mensagem crua
// de erro inesperado ficam so no log do servidor.
export async function handle(fn: () => Promise<unknown> | unknown) {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    const { body, status } = corpoDeErro(err);
    if (status >= 500) console.error("[api] erro nao tratado:", err);
    return NextResponse.json(body, { status });
  }
}
