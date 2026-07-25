import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { goalCreateSchema, goalUpdateSchema } from "@/lib/schemas";
import { listGoals, createGoal, updateGoal, deleteGoal } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listGoals(householdId);
  });
}

// Cria uma meta nova, ou atualiza/deposita numa existente se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(goalUpdateSchema, raw);
      return updateGoal(householdId, body.id, body);
    }

    const body = validate(goalCreateSchema, raw);
    return createGoal(householdId, {
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
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id da meta a remover.");
    await deleteGoal(householdId, id);
    return { ok: true };
  });
}
