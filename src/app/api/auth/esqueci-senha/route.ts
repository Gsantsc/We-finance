import { NextRequest } from "next/server";
import { handle, readJson, validate, ApiError } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/schemas";
import { getUserByEmail, createPasswordResetToken } from "@/lib/repo";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";

// Pede o link de redefinição.
//
// A resposta e' SEMPRE a mesma, exista o e-mail ou nao. Responder "e-mail nao
// encontrado" transformaria esta rota num oraculo: qualquer um descobriria
// quem tem conta aqui testando uma lista de e-mails.
//
// Pelo mesmo motivo, falha no envio tambem nao vaza: fica no log do servidor.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";

    // Dois limites: por IP (impede varrer muitos e-mails de uma origem) e por
    // e-mail (impede encher a caixa de uma vitima especifica de links).
    if (!rateLimit(`esqueci-ip:${ip}`, 10, 60 * 60 * 1000)) {
      throw new ApiError("Muitas tentativas. Tente daqui a pouco.", 429);
    }

    const body = validate(forgotPasswordSchema, await readJson(req));

    if (!rateLimit(`esqueci-email:${body.email}`, 3, 60 * 60 * 1000)) {
      throw new ApiError("Muitas tentativas. Tente daqui a pouco.", 429);
    }

    const user = await getUserByEmail(body.email);
    if (user) {
      try {
        const token = await createPasswordResetToken(user.id, ip);
        await sendPasswordResetEmail(user.email, user.name, token);
      } catch (err) {
        console.error("[esqueci-senha] falha ao enviar:", err);
      }
    }

    return {
      message:
        "Se houver uma conta com esse e-mail, o link de redefinição chega em instantes.",
    };
  });
}
