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

  // Cascata (um clique do casal confirma os dois) so em deploy fechado por
  // allowlist - ver comentario em consumeEmailVerificationToken.
  const cascata = (process.env.ALLOWED_SIGNUP_EMAILS ?? "").trim().length > 0;
  const verificados = await consumeEmailVerificationToken(token, { cascata });
  if (!verificados) {
    return NextResponse.redirect(`${base}/login?confirmacao=expirada`);
  }

  // Conta casal: um clique confirmou os dois - avisa na tela de login.
  const resultado = verificados.length > 1 ? "ok-casal" : "ok";
  return NextResponse.redirect(`${base}/login?confirmacao=${resultado}`);
}
