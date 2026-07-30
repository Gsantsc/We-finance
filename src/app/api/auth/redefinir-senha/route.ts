import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { handle, readJson, validate, ApiError } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/schemas";
import { consumePasswordResetToken } from "@/lib/repo";
import { rateLimit } from "@/lib/ratelimit";

// Consome o token do link e grava a senha nova.
//
// Token inexistente, expirado e ja usado dao a MESMA resposta: distinguir
// permitiria sondar quais tokens existem.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
    // O token tem 256 bits, entao forca bruta e' inviavel de qualquer jeito -
    // este limite existe para nao virar caminho barato de martelar o banco.
    if (!rateLimit(`redefinir:${ip}`, 20, 15 * 60 * 1000)) {
      throw new ApiError("Muitas tentativas. Tente daqui a pouco.", 429);
    }

    const body = validate(resetPasswordSchema, await readJson(req));
    const hash = await bcrypt.hash(body.newPassword, 10);
    const user = await consumePasswordResetToken(body.token, hash);

    if (!user) {
      throw new ApiError(
        "Este link não vale mais. Peça um novo em 'Esqueci minha senha'.",
        400
      );
    }

    return { message: "Senha alterada. Já pode entrar com ela." };
  });
}
