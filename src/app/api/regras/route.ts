import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { ruleCreateSchema } from "@/lib/schemas";
import { listRules, createRule, setRuleActive, deleteRule } from "@/lib/repo";

// Regras de categorizacao: "descricao contem X -> categoria Y". Rodam no import
// e no lancamento manual sem categoria, para pre-preencher a categoria.

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listRules(householdId);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const body = validate(ruleCreateSchema, await readJson(req));
    return createRule(householdId, body);
  });
}

// Liga/desliga uma regra sem apagar.
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;
    if (!raw?.id || typeof raw.active !== "boolean") {
      throw new ApiError("Informe id e active.");
    }
    await setRuleActive(householdId, raw.id, raw.active);
    return { ok: true };
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id da regra a remover.");
    await deleteRule(householdId, id);
    return { ok: true };
  });
}
