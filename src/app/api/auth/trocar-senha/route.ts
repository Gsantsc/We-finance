import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { handle, readJson, requireSession, validate, ApiError } from "@/lib/api";
import { changePasswordSchema, SENHA_PADRAO } from "@/lib/schemas";
import { setUserPassword } from "@/lib/repo";
import { rateLimit } from "@/lib/ratelimit";

// Troca a senha do usuario logado. Usa requireSession (nao requireHousehold)
// de proposito: quem esta na senha padrao precisa passar por aqui.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession();
    if (!rateLimit(`trocar-senha:${session.user.id}`, 5, 15 * 60 * 1000)) {
      throw new ApiError("Muitas tentativas. Aguarde alguns minutos.", 429);
    }
    const body = validate(changePasswordSchema, await readJson(req));

    if (body.newPassword === SENHA_PADRAO) {
      throw new ApiError("A nova senha não pode ser a senha padrao.");
    }

    await setUserPassword(session.user.id, await bcrypt.hash(body.newPassword, 10));
    return { ok: true };
  });
}
