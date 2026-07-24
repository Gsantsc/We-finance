import { NextRequest } from "next/server";
import { handle, readJson, requireSession, validate, ApiError } from "@/lib/api";
import { billCreateSchema, billUpdateSchema } from "@/lib/schemas";
import { listBills, createBill, updateBill, deleteBill } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return listBills();
  });
}

// Cria uma conta a pagar, ou atualiza/marca como paga se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(billUpdateSchema, raw);
      return updateBill(body.id, body);
    }

    const body = validate(billCreateSchema, raw);
    return createBill(body);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Informe o id da conta a remover.");
    await deleteBill(id);
    return { ok: true };
  });
}
