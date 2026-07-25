import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate } from "@/lib/api";
import { entityCreateSchema, entityUpdateSchema } from "@/lib/schemas";
import { listEntities, createEntity, updateEntity } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listEntities(householdId);
  });
}

// Cria uma entidade nova, ou atualiza uma existente se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(entityUpdateSchema, raw);
      return updateEntity(householdId, body.id, body);
    }

    const body = validate(entityCreateSchema, raw);
    return createEntity(householdId, {
      name: body.name,
      type: body.type,
      ownerId: body.ownerId ?? null,
      color: body.color ?? "#6366f1",
    });
  });
}
