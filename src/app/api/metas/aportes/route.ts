import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { goalContributionCreateSchema } from "@/lib/schemas";
import {
  createGoalContribution,
  deleteGoalContribution,
  listGoalContributions,
  listGoalProgress,
} from "@/lib/repo";

// Sem ?goalId: progresso de TODAS as metas (v_goal_progress) - e' o que o
// dashboard usa. Com ?goalId: o extrato de aportes daquela meta.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const goalId = new URL(req.url).searchParams.get("goalId");
    return goalId
      ? listGoalContributions(householdId, goalId)
      : listGoalProgress(householdId);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { session, householdId } = await requireHousehold();
    const body = validate(goalContributionCreateSchema, await readJson(req));
    return createGoalContribution(householdId, {
      goalId: body.goalId,
      amount: body.amount,
      date: body.date,
      note: body.note ?? null,
      createdById: session.user?.id ?? null,
    });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id do aporte a remover.");
    await deleteGoalContribution(householdId, id);
    return { ok: true };
  });
}
