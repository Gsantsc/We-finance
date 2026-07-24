"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";

type Account = { id: string; name: string; balance: number; type: string };
type Entity = {
  id: string;
  name: string;
  type: "CASA" | "PESSOAL" | "PJ";
  color: string;
  accounts: Account[];
  owner?: { name: string } | null;
};
type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account: { name: string; entity?: { name: string } | null };
  category?: { name: string; icon: string } | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const groupLabel: Record<string, string> = { CASA: "Casa", PESSOAL: "Pessoal", PJ: "PJ" };

export default function DashboardPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [semEntidade, setSemEntidade] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [erro, setErro] = useState("");

  async function load() {
    try {
      const [entRes, txRes, accRes] = await Promise.all([
        getJson<Entity[]>("/api/entidades"),
        getJson<Transaction[]>("/api/transacoes?limit=10"),
        getJson<{ entityId?: string | null }[]>("/api/contas"),
      ]);
      setEntities(entRes);
      setTransactions(txRes);
      setSemEntidade(accRes.filter((a) => !a.entityId).length);
      setErro("");
    } catch (e: any) {
      setErro(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const data = await postJson<{ accountsSynced: number; transactionsSynced: number }>(
        "/api/sync",
        {}
      );
      setSyncMessage(
        `Sincronizado: ${data.accountsSynced} contas, ${data.transactionsSynced} transacoes.`
      );
      await load();
    } catch (e: any) {
      setSyncMessage(`Erro: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const total = entities.reduce(
    (sum, e) => sum + e.accounts.reduce((s, a) => s + a.balance, 0),
    0
  );

  const grouped: Record<string, Entity[]> = { CASA: [], PESSOAL: [], PJ: [] };
  for (const e of entities) grouped[e.type]?.push(e);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Painel geral</h1>
            <p className="text-slate-500">
              Patrimonio total: <span className="font-medium text-slate-900">{currency.format(total)}</span>
            </p>
            {semEntidade > 0 && (
              // O total soma so o que esta dentro de alguma entidade. Sem este
              // aviso, uma conta recem-sincronizada some da conta sem explicacao.
              <p className="text-xs text-amber-700">
                {semEntidade} conta(s) ainda sem entidade nao entram neste total - classifique em Contas.
              </p>
            )}
          </div>
          <div className="text-right">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {syncing ? "Sincronizando..." : "Sincronizar com Pluggy"}
            </button>
            {syncMessage && <p className="mt-1 text-xs text-slate-500">{syncMessage}</p>}
          </div>
        </div>

        <ErroBanner mensagem={erro} />

        {Object.entries(grouped).map(([type, ents]) =>
          ents.length ? (
            <section key={type} className="space-y-3">
              <h2 className="text-lg font-medium text-slate-800">{groupLabel[type]}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ents.map((e) => {
                  const entTotal = e.accounts.reduce((s, a) => s + a.balance, 0);
                  return (
                    <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-slate-900">{e.name}</h3>
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: e.color || "#6366f1" }}
                        />
                      </div>
                      <p className="mt-2 text-xl font-semibold text-slate-900">{currency.format(entTotal)}</p>
                      <p className="mt-1 text-xs text-slate-500">{e.accounts.length} conta(s)</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-slate-800">Ultimas transacoes</h2>
          {/* No celular a tabela rola na horizontal em vez de espremer as colunas. */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Descricao</th>
                  <th className="px-4 py-2">Entidade</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(t.date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2 text-slate-500">{t.account.entity?.name || "-"}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {t.category ? `${t.category.icon} ${t.category.name}` : "-"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        t.amount < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {currency.format(t.amount)}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      Nenhuma transacao ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
