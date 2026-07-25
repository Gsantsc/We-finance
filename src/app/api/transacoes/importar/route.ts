import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate } from "@/lib/api";
import { importSchema } from "@/lib/schemas";
import { importTransactions } from "@/lib/repo";

// Recebe as linhas ja parseadas e mapeadas pela tela /importar (o arquivo nunca
// sai do navegador). Revalida tudo com zod e grava os lancamentos na conta
// escolhida, com dedup por fingerprint. Devolve quantas entraram / repetiram.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { session, householdId } = await requireHousehold();
    const body = validate(importSchema, await readJson(req));

    return importTransactions(householdId, {
      accountId: body.accountId,
      filename: body.filename ?? null,
      createdById: session.user?.id ?? null,
      rows: body.rows.map((r) => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        categoryName: r.categoryName ?? null,
      })),
    });
  });
}
