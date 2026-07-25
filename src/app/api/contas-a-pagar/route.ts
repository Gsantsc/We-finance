import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { billCreateSchema, billUpdateSchema } from "@/lib/schemas";
import { listBills, createBill, updateBill, deleteBill } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listBills(householdId);
  });
}

// Cria uma conta a pagar, ou atualiza/marca como paga se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(billUpdateSchema, raw);
      return updateBill(householdId, body.id, body);
    }

    const body = validate(billCreateSchema, raw);
    return createBill(householdId, body);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id da conta a remover.");
    await deleteBill(householdId, id);
    return { ok: true };
  });
}
