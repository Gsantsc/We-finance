"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";

type Category = { id: string; name: string; icon: string };
type Account = { id: string; name: string; entity?: { id: string; name: string } | null };
type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account: Account;
  category?: Category | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function TransacoesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({
    accountId: "",
    categoryId: "",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    try {
      const [txRes, accRes, catRes] = await Promise.all([
        getJson<Transaction[]>("/api/transacoes"),
        getJson<Account[]>("/api/contas"),
        getJson<Category[]>("/api/categorias"),
      ]);
      setTransactions(txRes);
      setAccounts(accRes);
      setCategories(catRes);
      setErro("");
    } catch (e: any) {
      setErro(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postJson("/api/transacoes", {
        accountId: form.accountId,
        categoryId: form.categoryId || null,
        description: form.description,
        amount: parseFloat(form.amount),
        date: form.date,
      });
      setForm({
        accountId: "",
        categoryId: "",
        description: "",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
      });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Transacoes</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancelar" : "Nova transacao"}
          </button>
        </div>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3"
          >
            <select
              required
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Conta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.entity ? ` (${a.entity.name})` : ""}
                </option>
              ))}
            </select>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Descricao"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder="Valor (negativo = gasto)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3">
              Salvar transacao
            </button>
          </form>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Descricao</th>
                <th className="px-4 py-2">Conta</th>
                <th className="px-4 py-2">Entidade</th>
                <th className="px-4 py-2">Categoria</th>
                <th className="px-4 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{new Date(t.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2">{t.description}</td>
                  <td className="px-4 py-2 text-slate-500">{t.account?.name}</td>
                  <td className="px-4 py-2 text-slate-500">{t.account?.entity?.name || "-"}</td>
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
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Nenhuma transacao ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
