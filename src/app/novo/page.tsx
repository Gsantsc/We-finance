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
        <div>
          <p className="eyebrow text-honey-deep">Rapido</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Lancar gasto</h1>
          <p className="mt-1 text-sm text-sage">
            Uma despesa de hoje, em segundos. Para receita ou outra data, use{" "}
            <Link href="/transacoes" className="link-honey">Lancamentos</Link>.
          </p>
        </div>

        <ErroBanner mensagem={erro} />
        {salvo && (
          <p className="rounded-xl bg-pine/8 px-4 py-3 text-sm font-medium text-pine">
            Gasto lancado. ✓
          </p>
        )}

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor="amount" className="eyebrow">Quanto foi?</label>
            <div className="flex items-baseline gap-2 rounded-xl border border-pine/15 bg-white/70 px-4 py-3 focus-within:border-honey focus-within:ring-2 focus-within:ring-honey/25">
              <span className="font-serif text-2xl text-sage">R$</span>
              <input
                id="amount"
                required
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-transparent font-serif text-4xl text-ink tnum placeholder:text-sage/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="eyebrow">Com o que?</label>
            <input id="description" required placeholder="Ex: Mercado" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="accountId" className="eyebrow">Conta</label>
            <select id="accountId" required value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="input">
              <option value="" disabled>Escolher conta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.entity ? ` (${a.entity.name})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="categoryId" className="eyebrow">Categoria</label>
            <select id="categoryId" value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input">
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={salvando} className="btn-accent w-full py-3">
            {salvando ? "Salvando..." : "Lancar gasto"}
          </button>
        </form>
      </main>
    </div>
  );
}
