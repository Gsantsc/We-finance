import { NextRequest } from "next/server";
import { handle, readJson, requireSession, validate } from "@/lib/api";
import { accountCreateSchema, accountUpdateSchema } from "@/lib/schemas";
import { listAccounts, createAccount, updateAccount } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return listAccounts();
  });
}

// Cria uma conta manual, ou atualiza uma existente se "id" vier no corpo
// (usado tambem para classificar contas sincronizadas em uma entidade).
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(accountUpdateSchema, raw);
      return updateAccount(body.id, body);
    }

    const body = validate(accountCreateSchema, raw);
    return createAccount({
      name: body.name,
      type: body.type,
      entityId: body.entityId ?? null,
      balance: body.balance ?? 0,
      institution: body.institution ?? null,
    });
  });
}
