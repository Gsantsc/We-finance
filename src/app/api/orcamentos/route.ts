import { NextRequest } from "next/server";
import { handle, readJson, requireSession, validate, ApiError } from "@/lib/api";
import { budgetUpsertSchema } from "@/lib/schemas";
import { listBudgets, upsertBudget, deleteBudget } from "@/lib/repo";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const agora = new Date();
    const month = Number(searchParams.get("month")) || agora.getMonth() + 1;
    const year = Number(searchParams.get("year")) || agora.getFullYear();
    return listBudgets(month, year);
  });
}

// Cria ou atualiza o orcamento de uma categoria no mes.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const body = validate(budgetUpsertSchema, await readJson(req));
    return upsertBudget(body);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id do orcamento a remover.");
    await deleteBudget(id);
    return { ok: true };
  });
}
