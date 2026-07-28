"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, mensagemDeErro } from "@/lib/http";

type Entity = {
  id: string;
  name: string;
  type: string;
  color: string;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  accounts: any[];
};

type Membro = { id: string; name: string };

const typeLabel: Record<string, string> = { CASA: "Casa", PESSOAL: "Pessoal", PJ: "PJ" };

const formVazio = { name: "", type: "PESSOAL", color: "#356154", ownerId: "" };

export default function EntidadesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);

  async function load() {
    try {
      const [ents, mem] = await Promise.all([
        getJson<Entity[]>("/api/entidades"),
        getJson<Membro[]>("/api/membros"),
      ]);
      setEntities(ents);
      setMembros(mem);
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  // Trocar o dono direto no card: e' o campo que define se o valor entra na
  // coluna da pessoa ou na do casal no dashboard.
  async function trocarDono(entityId: string, ownerId: string) {
    try {
      await postJson("/api/entidades", { id: entityId, ownerId: ownerId || null });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postJson("/api/entidades", { ...form, ownerId: form.ownerId || null });
      setForm(formVazio);
      setShowForm(false);
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
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
        <p className="text-sm text-sage">
          O <strong>dono</strong> decide de quem e' o dinheiro no dashboard: com dono, o valor entra na
          coluna daquela pessoa; sem dono, entra na coluna do casal.
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
            <select
              value={form.ownerId}
              onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
              className="input"
            >
              <option value="">Dono: do casal</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  Dono: {m.name}
                </option>
              ))}
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
              <p className="mt-1 text-xs text-sage">{typeLabel[e.type]}</p>
              <label className="mt-3 block text-xs text-sage">
                Dono
                <select
                  value={e.ownerId ?? ""}
                  onChange={(ev) => trocarDono(e.id, ev.target.value)}
                  className="input mt-1 py-1.5 text-sm"
                >
                  <option value="">Do casal</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-sm text-ink/75">{e.accounts.length} conta(s)</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
