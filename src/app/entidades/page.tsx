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
  const [form, setForm] = useState({ name: "", type: "PESSOAL", color: "#356154" });

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
      setForm({ name: "", type: "PESSOAL", color: "#356154" });
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
          <h1 className="font-serif text-3xl text-ink">Entidades</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancelar" : "Nova entidade"}
          </button>
        </div>
        <p className="text-sm text-sage">
          Entidades organizam suas contas em Casa (compartilhado), Pessoal (individual) ou PJ (empresa).
          Crie quantas precisar - por exemplo, um PJ para cada um de voces.
        </p>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-3"
          >
            <input
              required
              placeholder="Nome (ex: PJ - Esposa)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="input"
            >
              <option value="CASA">Casa</option>
              <option value="PESSOAL">Pessoal</option>
              <option value="PJ">PJ</option>
            </select>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-full rounded-xl border border-pine/15"
            />
            <button type="submit" className="btn-primary sm:col-span-3">
              Salvar entidade
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <div key={e.id} className="card p-5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                <h3 className="font-medium">{e.name}</h3>
              </div>
              <p className="mt-1 text-xs text-sage">
                {typeLabel[e.type]}
                {e.owner ? ` - ${e.owner.name}` : ""}
              </p>
              <p className="mt-2 text-sm text-ink/75">{e.accounts.length} conta(s)</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
