import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import {
  listItems,
  listAccounts,
  listTransactions,
  mapAccountType,
  normalizeBalance,
} from "@/lib/pluggy";
import { upsertPluggyAccount, upsertCategoryByName, upsertPluggyTransaction } from "@/lib/repo";

export async function POST() {
  try {
    await requireSession();

    const items = await listItems();
    let accountsSynced = 0;
    let transactionsSynced = 0;

    for (const item of items) {
      const pluggyAccounts = await listAccounts(item.id);

      for (const pa of pluggyAccounts) {
        const account = await upsertPluggyAccount({
          name: pa.name,
          type: mapAccountType(pa.type, pa.subtype),
          balance: normalizeBalance(pa.type, pa.balance),
          currency: pa.currencyCode || "BRL",
          institution: item.connector?.name || null,
          pluggyItemId: item.id,
          pluggyAccountId: pa.id,
        });
        accountsSynced += 1;

        const transactions = await listTransactions(pa.id);
        for (const t of transactions) {
          let categoryId: string | null = null;
          if (t.category) {
            categoryId = (await upsertCategoryByName(t.category)).id;
          }
          await upsertPluggyTransaction({
            accountId: account.id,
            description: t.description,
            amount: t.amount,
            date: t.date,
            categoryId,
            pluggyTransactionId: t.id,
          });
          transactionsSynced += 1;
        }
      }
    }

    return NextResponse.json({ ok: true, accountsSynced, transactionsSynced });
  } catch (err: any) {
    console.error(err);
    const status = err?.status === 401 ? 401 : 500;
    return NextResponse.json({ ok: false, error: err.message }, { status });
  }
}
