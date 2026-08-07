import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { ruleCreateSchema, ruleUpdateSchema } from "@/lib/schemas";
import { listRules, createRule, updateRule, setRuleActive, deleteRule } from "@/lib/repo";

// Regras de categorizacao: "descrição contem X -> categoria Y". Rodam no import
// e no lancamento manual sem categoria, para pre-preencher a categoria.

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listRules(householdId);
  });
}

// Cria, ou atualiza quando vem "id" - mesmo padrão das outras rotas.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(ruleUpdateSchema, raw);
      return updateRule(householdId, body.id, body);
    }
    const body = validate(ruleCreateSchema, raw);
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
