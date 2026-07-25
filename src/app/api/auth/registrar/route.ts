import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { handle, readJson, validate, ApiError } from "@/lib/api";
import { registerSchema, SENHA_PADRAO } from "@/lib/schemas";
import {
  createPendingUser,
  createHousehold,
  addHouseholdMember,
  createEmailVerificationToken,
  getUserByEmail,
} from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";

// Allowlist opcional de admin: se ALLOWED_SIGNUP_EMAILS estiver definida
// (emails separados por virgula), so esses emails conseguem se cadastrar.
// Vazia/ausente = cadastro aberto.
function emailPermitido(email: string): boolean {
  const lista = (process.env.ALLOWED_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (lista.length === 0) return true;
  return lista.includes(email);
}

// Cadastro de conta CASAL (titular + parceiro(a), ambos recebem o email de
// confirmacao) ou UNICA (so o titular). Todo mundo nasce com a senha padrao
// e e' obrigado a trocar no primeiro login.
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Cadastro dispara emails - sem limite viraria ferramenta de spam.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
    if (!rateLimit(`registrar:${ip}`, 5, 60 * 60 * 1000)) {
      throw new ApiError("Muitas tentativas de cadastro. Tente mais tarde.", 429);
    }

    const body = validate(registerSchema, await readJson(req));

    if (!emailPermitido(body.email)) {
      throw new ApiError("Este email nao esta autorizado a se cadastrar.", 403);
    }
    if (body.tipo === "CASAL" && !emailPermitido(body.partnerEmail!)) {
      throw new ApiError("O email do(a) parceiro(a) nao esta autorizado a se cadastrar.", 403);
    }

    if (await getUserByEmail(body.email)) throw new ApiError("Email ja cadastrado.", 409);
    if (body.tipo === "CASAL" && (await getUserByEmail(body.partnerEmail!))) {
      throw new ApiError("O email do(a) parceiro(a) ja esta cadastrado.", 409);
    }

    const passwordHash = await bcrypt.hash(SENHA_PADRAO, 10);

    const titular = await createPendingUser({
      name: body.name,
      email: body.email,
      passwordHash,
    });

    const household = await createHousehold(
      body.tipo === "CASAL" ? `Casa de ${body.name} e ${body.partnerName}` : `Casa de ${body.name}`
    );
    await addHouseholdMember(household.id, titular.id);

    const pessoas = [{ user: titular, name: body.name, email: body.email }];

    if (body.tipo === "CASAL") {
      const parceiro = await createPendingUser({
        name: body.partnerName!,
        email: body.partnerEmail!,
        passwordHash,
      });
      await addHouseholdMember(household.id, parceiro.id);
      pessoas.push({ user: parceiro, name: body.partnerName!, email: body.partnerEmail! });
    }

    for (const p of pessoas) {
      const token = await createEmailVerificationToken(p.user.id);
      await sendVerificationEmail(p.email, p.name, token);
    }

    return {
      ok: true,
      message:
        body.tipo === "CASAL"
          ? "Contas criadas. Voces dois receberao um email de confirmacao."
          : "Conta criada. Voce recebera um email de confirmacao.",
    };
  });
}
