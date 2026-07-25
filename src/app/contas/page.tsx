"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";

type Entity = { id: string; name: string; type: string };
type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution?: string | null;
  isManual: boolean;
  entityId?: string | null;
  entity?: Entity | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const accountTypes = ["CORRENTE", "POUPANCA", "CARTAO", "INVESTIMENTO", "DINHEIRO", "OUTRO"];

export default function ContasPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ name: "", type: "CORRENTE", entityId: "", balance: "" });

  async function load() {
    try {
      const [accRes, entRes] = await Promise.all([
        getJson<Account[]>("/api/contas"),
        getJson<Entity[]>("/api/entidades"),
      ]);
      setAccounts(accRes);
      setEntities(entRes);
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
      await postJson("/api/contas", {
        name: form.name,
        type: form.type,
        entityId: form.entityId || null,
        balance: parseFloat(form.balance || "0"),
      });
      setForm({ name: "", type: "CORRENTE", entityId: "", balance: "" });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function assignEntity(accountId: string, entityId: string) {
    try {
      await postJson("/api/contas", { id: accountId, entityId: entityId || null });
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const unassigned = accounts.filter((a) => !a.entityId);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-3xl text-ink">Contas</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancelar" : "Nova conta manual"}
          </button>
        </div>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-4"
          >
            <input
              required
              placeholder="Nome (ex: Carteira)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input sm:col-span-2"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="input"
            >
              {accountTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              className="input"
            >
              <option value="">Sem entidade</option>
              {entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Saldo inicial"
              type="number"
              step="0.01"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
              className="input"
            />
            <button type="submit" className="btn-primary sm:col-span-4">
              Salvar conta
            </button>
          </form>
        )}

        {unassigned.length > 0 && (
          <section className="rounded-2xl border border-honey/25 bg-honey/8 p-5">
            <h2 className="font-semibold text-pine">Contas sincronizadas sem entidade definida</h2>
            <p className="mt-1 text-sm text-ink/70">
              Classifique cada conta puxada da Pluggy como Casa, Pessoal ou PJ.
            </p>
            <div className="mt-3 space-y-2">
              {unassigned.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2">
                  <span className="text-sm font-medium">
                    {a.name} <span className="text-sage">({a.institution})</span>
                  </span>
                  <select
                    onChange={(e) => assignEntity(a.id, e.target.value)}
                    defaultValue=""
                    className="rounded-md border border-pine/15 px-2 py-1 text-sm"
                  >
                    <option value="" disabled>
                      Escolher entidade
                    </option>
                    {entities.map((en) => (
                      <option key={en.id} value={en.id}>
                        {en.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No celular a tabela rola na horizontal em vez de espremer as colunas. */}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-pine/[0.04] text-left text-sage">
              <tr>
                <th className="px-4 py-2">Conta</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Entidade</th>
                <th className="px-4 py-2">Origem</th>
                <th className="px-4 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-pine/8">
                  <td className="px-4 py-2 font-medium">{a.name}</td>
                  <td className="px-4 py-2 text-sage">{a.type}</td>
                  <td className="px-4 py-2 text-sage">{a.entity?.name || "-"}</td>
                  <td className="px-4 py-2 text-sage">{a.isManual ? "Manual" : "Pluggy"}</td>
                  <td className="px-4 py-2 text-right font-medium">{currency.format(a.balance)}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sage">
                    Nenhuma conta ainda.
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
