import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/api";
import {
  listItems,
  listAccounts,
  listTransactions,
  mapAccountType,
  normalizeBalance,
} from "@/lib/pluggy";
import { upsertPluggyAccount, upsertCategoryByName, upsertPluggyTransaction } from "@/lib/repo";

// As credenciais da Pluggy sao GLOBAIS do deploy (um unico client id/secret),
// entao listItems() enxerga os bancos de todo mundo. Sem esta trava, qualquer
// usuario autenticado importaria contas e extratos das outras casas para a
// dele. So os emails em PLUGGY_SYNC_EMAILS podem sincronizar; vazio = ninguem.
function podeSincronizar(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.PLUGGY_SYNC_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function POST() {
  try {
    const { session, householdId } = await requireHousehold();
    if (!podeSincronizar(session.user.email)) {
      return NextResponse.json(
        { ok: false, error: "Sincronizacao nao habilitada para este usuario." },
        { status: 403 }
      );
    }

    const items = await listItems();
    let accountsSynced = 0;
    let transactionsSynced = 0;

    for (const item of items) {
      const pluggyAccounts = await listAccounts(item.id);

      for (const pa of pluggyAccounts) {
        const account = await upsertPluggyAccount(householdId, {
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
    const status = typeof err?.status === "number" ? err.status : 500;
    // 500: mensagem generica - a crua pode ecoar resposta bruta da Pluggy.
    const mensagem = status === 500 ? "Erro interno na sincronizacao." : err.message;
    return NextResponse.json({ ok: false, error: mensagem }, { status });
  }
}
