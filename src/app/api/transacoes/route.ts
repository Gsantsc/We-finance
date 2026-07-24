import { NextRequest } from "next/server";
import { handle, readJson, requireSession, validate } from "@/lib/api";
import { transactionCreateSchema, transactionUpdateSchema } from "@/lib/schemas";
import { listTransactions, createTransaction, updateTransaction } from "@/lib/repo";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));

    return listTransactions({
      entityId: searchParams.get("entityId"),
      accountId: searchParams.get("accountId"),
      categoryId: searchParams.get("categoryId"),
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    });
  });
}

// Cria uma transacao manual, ou atualiza uma existente se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(transactionUpdateSchema, raw);
      return updateTransaction(body.id, body);
    }

    const body = validate(transactionCreateSchema, raw);
    return createTransaction({
      accountId: body.accountId,
      description: body.description,
      amount: body.amount,
      date: body.date,
      categoryId: body.categoryId ?? null,
      notes: body.notes ?? null,
      createdById: session.user?.id ?? null,
    });
  });
}
