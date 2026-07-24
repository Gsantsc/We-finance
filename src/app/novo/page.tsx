"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";

type Category = { id: string; name: string; icon: string; isIncome?: boolean };
type Account = { id: string; name: string; entity?: { id: string; name: string } | null };

const hoje = () => new Date().toISOString().slice(0, 10);

// Atalho do PWA (manifest.webmanifest > shortcuts): tela unica, so o essencial
// para lancar um gasto rapido - sem lista, sem filtros.
export default function NovoGastoPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ accountId: "", categoryId: "", description: "", amount: "" });

  useEffect(() => {
    (async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          getJson<Account[]>("/api/contas"),
          getJson<Category[]>("/api/categorias"),
        ]);
        setAccounts(accRes);
        setCategories(catRes.filter((c) => !c.isIncome));
      } catch (e: any) {
        setErro(e.message);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const valor = parseFloat(form.amount.replace(",", "."));
      await postJson("/api/transacoes", {
        accountId: form.accountId,
        categoryId: form.categoryId || null,
        description: form.description,
        amount: -Math.abs(valor),
        date: hoje(),
      });
      setForm({ accountId: form.accountId, categoryId: "", description: "", amount: "" });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-md space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Lancar gasto</h1>
        <p className="text-sm text-slate-500">
          Registro rapido de uma despesa de hoje. Para outros tipos de lancamento
          (receita, data diferente), use a tela{" "}
          <Link href="/transacoes" className="text-indigo-600 hover:underline">
            Transacoes
          </Link>
          .
        </p>

        <ErroBanner mensagem={erro} />
        {salvo && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Gasto lancado.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label htmlFor="amount" className="text-sm font-medium text-slate-700">
              Quanto foi?
            </label>
            <input
              id="amount"
              required
              autoFocus
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-2xl font-semibold"
            />
          </div>

          <div>
            <label htmlFor="description" className="text-sm font-medium text-slate-700">
              Com o que?
            </label>
            <input
              id="description"
              required
              placeholder="Ex: Mercado"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="accountId" className="text-sm font-medium text-slate-700">
              Conta
            </label>
            <select
              id="accountId"
              required
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Escolher conta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.entity ? ` (${a.entity.name})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="categoryId" className="text-sm font-medium text-slate-700">
              Categoria
            </label>
            <select
              id="categoryId"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Lancar gasto"}
          </button>
        </form>
      </main>
    </div>
  );
}
