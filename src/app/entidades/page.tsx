"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, deleteJson, mensagemDeErro } from "@/lib/http";
import AcoesDaLinha from "@/components/AcoesDaLinha";

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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

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

  // O MESMO formulario cria e edita. Abrir uma tela separada para editar
  // obrigaria a pessoa a reaprender o layout justo quando ela so quer corrigir
  // uma palavra.
  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postJson("/api/entidades", {
        ...(editandoId ? { id: editandoId } : {}),
        ...form,
        ownerId: form.ownerId || null,
      });
      cancelarEdicao();
      await load();
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  function editar(ent: Entity) {
    setEditandoId(ent.id);
    setForm({ name: ent.name, type: ent.type, color: ent.color, ownerId: ent.ownerId ?? "" });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(formVazio);
    setShowForm(false);
  }

  async function apagar(ent: Entity) {
    setOcupado(ent.id);
    try {
      await deleteJson(`/api/entidades?id=${ent.id}`);
      await load();
      setErro("");
    } catch (err) {
      // A recusa do servidor ja vem explicando o que fazer (ver exclusao.ts).
      setErro(mensagemDeErro(err));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-3xl text-ink">De quem é o dinheiro</h1>
          <button
            onClick={() => (showForm ? cancelarEdicao() : setShowForm(true))}
            className="btn-primary"
          >
            {showForm ? "Cancelar" : "Nova divisão"}
          </button>
        </div>
        <p className="text-sm text-sage">
          Cada divisão agrupa contas pela origem do dinheiro: <strong>Casa</strong> (o que é dos
          dois), <strong>Pessoal</strong> (o que é de um só) ou <strong>PJ</strong> (a empresa).
          Crie quantas precisar — por exemplo, uma PJ para cada um.
        </p>
        <p className="text-sm text-sage">
          O <strong>dono</strong> decide em que coluna do painel o valor aparece: com dono, entra na
          coluna daquela pessoa; sem dono, entra na do casal.
        </p>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleSalvar}
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
              {editandoId ? "Salvar alterações" : "Criar divisão"}
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
              <div className="mt-3 flex items-baseline justify-between border-t border-pine/8 pt-2">
                <span className="text-sm text-ink/75">{e.accounts.length} conta(s)</span>
                <AcoesDaLinha
                  tipo="a divisão"
                  nome={e.name}
                  ocupado={ocupado === e.id}
                  aoEditar={() => editar(e)}
                  aoApagar={() => apagar(e)}
                />
              </div>
            </div>
          ))}
          {entities.length === 0 && (
            <p className="text-sm text-sage">
              Nenhuma divisão ainda. Crie uma em &ldquo;Nova divisão&rdquo;.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
