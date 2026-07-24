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

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new ApiError("Nao autenticado", 401);
  return session;
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
    if (status === 500) console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Erro inesperado" },
      { status }
    );
  }
}
