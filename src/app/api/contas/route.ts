import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { accountCreateSchema, accountUpdateSchema } from "@/lib/schemas";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listAccounts(householdId);
  });
}

// Cria uma conta manual, ou atualiza uma existente se "id" vier no corpo
// (usado tambem para classificar contas sincronizadas em uma entidade).
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(accountUpdateSchema, raw);
      return updateAccount(householdId, body.id, body);
    }

    const body = validate(accountCreateSchema, raw);
    return createAccount(householdId, {
      name: body.name,
      type: body.type,
      entityId: body.entityId ?? null,
      balance: body.balance ?? 0,
      institution: body.institution ?? null,
    });
  });
}

// Apagar. As regras de quando isso e seguro estao em src/lib/exclusao.ts, com
// teste - e a mensagem de recusa diz o que fazer, nao so que deu errado.
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o que apagar.");
    await deleteAccount(householdId, id);
    return { ok: true };
  });
}
