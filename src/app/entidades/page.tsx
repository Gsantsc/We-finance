"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";

type Entity = {
  id: string;
  name: string;
  type: string;
  color: string;
  owner?: { id: string; name: string } | null;
  accounts: any[];
};

const typeLabel: Record<string, string> = { CASA: "Casa", PESSOAL: "Pessoal", PJ: "PJ" };

export default function EntidadesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ name: "", type: "PESSOAL", color: "#6366f1" });

  async function load() {
    try {
      setEntities(await getJson<Entity[]>("/api/entidades"));
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
      await postJson("/api/entidades", form);
      setForm({ name: "", type: "PESSOAL", color: "#6366f1" });
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
          <h1 className="text-2xl font-semibold">Entidades</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancelar" : "Nova entidade"}
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Entidades organizam suas contas em Casa (compartilhado), Pessoal (individual) ou PJ (empresa).
          Crie quantas precisar - por exemplo, um PJ para cada um de voces.
        </p>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3"
          >
            <input
              required
              placeholder="Nome (ex: PJ - Esposa)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="CASA">Casa</option>
              <option value="PESSOAL">Pessoal</option>
              <option value="PJ">PJ</option>
            </select>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-full rounded-lg border border-slate-300"
            />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3">
              Salvar entidade
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                <h3 className="font-medium">{e.name}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {typeLabel[e.type]}
                {e.owner ? ` - ${e.owner.name}` : ""}
              </p>
              <p className="mt-2 text-sm text-slate-600">{e.accounts.length} conta(s)</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
