"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";
import { formatDateBR } from "@/lib/formato";

type Category = { id: string; name: string; icon: string };
type Account = { id: string; name: string; entity?: { id: string; name: string } | null };
type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account: Account;
  category?: Category | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
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
    installments: "1",
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
    const parcelas = Math.max(1, parseInt(form.installments || "1", 10));
    try {
      await postJson("/api/transacoes", {
        accountId: form.accountId,
        categoryId: form.categoryId || null,
        description: form.description,
        amount: parseFloat(form.amount),
        date: form.date,
        ...(parcelas > 1 ? { installments: parcelas } : {}),
      });
      setForm({
        accountId: "",
        categoryId: "",
        description: "",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        installments: "1",
      });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const parcelas = Math.max(1, parseInt(form.installments || "1", 10));

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl text-ink">Lancamentos</h1>
          <div className="flex items-center gap-2">
            <Link href="/regras" className="btn-ghost">Regras</Link>
            <Link href="/importar" className="btn-ghost">Importar CSV</Link>
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
              {showForm ? "Cancelar" : "Nova transacao"}
            </button>
          </div>
        </div>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-3"
          >
            <select
              required
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              className="input"
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
              className="input"
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
              className="input"
            />
            <input
              required
              placeholder="Descricao"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input sm:col-span-2"
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder={parcelas > 1 ? "Valor total da compra" : "Valor (negativo = gasto)"}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input"
            />
            <label className="flex items-center gap-2 text-sm text-ink/75">
              <span className="whitespace-nowrap">Parcelas</span>
              <input
                type="number"
                min="1"
                max="360"
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: e.target.value })}
                className="input"
              />
            </label>
            {parcelas > 1 && (
              <p className="text-xs text-sage sm:col-span-3">
                Vira {parcelas} lancamentos mensais a partir da data — o valor acima e' o
                <strong> total</strong> da compra, dividido nas parcelas.
              </p>
            )}
            <button type="submit" className="btn-primary sm:col-span-3">
              {parcelas > 1 ? `Salvar em ${parcelas}x` : "Salvar transacao"}
            </button>
          </form>
        )}

        {/* No celular a tabela rola na horizontal em vez de espremer as colunas. */}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-pine/[0.04] text-left text-sage">
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
                <tr key={t.id} className="border-t border-pine/8">
                  <td className="px-4 py-2 text-sage">{formatDateBR(t.date)}</td>
                  <td className="px-4 py-2">
                    {t.description}
                    {t.installmentTotal && t.installmentTotal > 1 && (
                      <span className="ml-2 chip bg-pine/8 text-pine/70">
                        {t.installmentNumber}/{t.installmentTotal}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sage">{t.account?.name}</td>
                  <td className="px-4 py-2 text-sage">{t.account?.entity?.name || "-"}</td>
                  <td className="px-4 py-2 text-sage">
                    {t.category ? `${t.category.icon} ${t.category.name}` : "-"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${
                      t.amount < 0 ? "text-clay" : "text-pine-600"
                    }`}
                  >
                    {currency.format(t.amount)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sage">
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
