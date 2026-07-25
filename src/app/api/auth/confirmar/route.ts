import { NextRequest, NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/lib/repo";

// Link do email de confirmacao. Redireciona para o login com o resultado -
// e' uma navegacao de browser, nao uma chamada de API, entao a resposta
// certa e' redirect, nao JSON.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;

  if (!token) {
    return NextResponse.redirect(`${base}/login?confirmacao=invalida`);
  }

  const user = await consumeEmailVerificationToken(token);
  if (!user) {
    return NextResponse.redirect(`${base}/login?confirmacao=expirada`);
  }

  return NextResponse.redirect(`${base}/login?confirmacao=ok`);
}
