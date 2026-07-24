import { NextRequest } from "next/server";
import { handle, readJson, requireSession, validate, ApiError } from "@/lib/api";
import { goalCreateSchema, goalUpdateSchema } from "@/lib/schemas";
import { listGoals, createGoal, updateGoal, deleteGoal } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return listGoals();
  });
}

// Cria uma meta nova, ou atualiza/deposita numa existente se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(goalUpdateSchema, raw);
      return updateGoal(body.id, body);
    }

    const body = validate(goalCreateSchema, raw);
    return createGoal({
      entityId: body.entityId,
      name: body.name,
      targetAmount: body.targetAmount,
      currentAmount: body.currentAmount,
      targetDate: body.targetDate ?? null,
    });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id da meta a remover.");
    await deleteGoal(id);
    return { ok: true };
  });
}
