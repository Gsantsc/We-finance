import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate } from "@/lib/api";
import { transactionCreateSchema, transactionUpdateSchema } from "@/lib/schemas";
import { listTransactions, createTransaction, updateTransaction, createInstallmentPurchase } from "@/lib/repo";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));

    return listTransactions(householdId, {
      entityId: searchParams.get("entityId"),
      accountId: searchParams.get("accountId"),
      categoryId: searchParams.get("categoryId"),
      month: searchParams.get("mes"),
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      offset: Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : undefined,
    });
  });
}

// Cria uma transacao manual, ou atualiza uma existente se "id" vier no corpo.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { session, householdId } = await requireHousehold();
    const raw = (await readJson(req)) as any;

    if (raw?.id) {
      const body = validate(transactionUpdateSchema, raw);
      return updateTransaction(householdId, body.id, body);
    }

    const body = validate(transactionCreateSchema, raw);

    // Parcelado: uma linha por mes. O modo diz se o amount e' o total da compra
    // ("split") ou o valor de cada parcela ("fixed", caso do emprestimo).
    if (body.installments && body.installments > 1) {
      return createInstallmentPurchase(householdId, {
        accountId: body.accountId,
        description: body.description,
        amount: body.amount,
        installments: body.installments,
        mode: body.installmentMode ?? "fixed",
        interestRateBps: body.interestRateBps ?? null,
        creditor: body.creditor ?? null,
        date: body.date,
        categoryId: body.categoryId ?? null,
        createdById: session.user?.id ?? null,
      });
    }

    return createTransaction(householdId, {
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
