import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { budgetUpsertSchema } from "@/lib/schemas";
import { listBudgets, upsertBudget, deleteBudget } from "@/lib/repo";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const { searchParams } = new URL(req.url);
    const agora = new Date();
    const month = Number(searchParams.get("month")) || agora.getMonth() + 1;
    const year = Number(searchParams.get("year")) || agora.getFullYear();
    return listBudgets(householdId, month, year);
  });
}

// Cria ou atualiza o orcamento de uma categoria no mes.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const body = validate(budgetUpsertSchema, await readJson(req));
    return upsertBudget(householdId, body);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id do orcamento a remover.");
    await deleteBudget(householdId, id);
    return { ok: true };
  });
}
