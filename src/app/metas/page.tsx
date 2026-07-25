"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";
import { currency, formatDateBR } from "@/lib/formato";

type Entity = { id: string; name: string };
type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  percent: number;
  restante: number;
  concluida: boolean;
  entity: Entity | null;
};

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [erro, setErro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entityId: "", name: "", targetAmount: "", currentAmount: "", targetDate: "" });

  async function load() {
    try {
      const [goalRes, entRes] = await Promise.all([
        getJson<Goal[]>("/api/metas"),
        getJson<Entity[]>("/api/entidades"),
      ]);
      setGoals(goalRes);
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
      await postJson("/api/metas", {
        entityId: form.entityId,
        name: form.name,
        targetAmount: parseFloat(form.targetAmount || "0"),
        currentAmount: parseFloat(form.currentAmount || "0"),
        targetDate: form.targetDate || null,
      });
      setForm({ entityId: "", name: "", targetAmount: "", currentAmount: "", targetDate: "" });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function depositar(id: string) {
    const valor = prompt("Quanto guardar nesta meta? (use negativo para tirar)");
    if (valor === null) return;
    const n = parseFloat(valor.replace(",", "."));
    if (Number.isNaN(n)) return;
    try {
      await postJson("/api/metas", { id, deposito: n });
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function remover(id: string) {
    try {
      await fetch(`/api/metas?id=${id}`, { method: "DELETE" });
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
          <h1 className="font-serif text-3xl text-ink">Metas de economia</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancelar" : "Nova meta"}
          </button>
        </div>

        <p className="text-sm text-sage">
          Junte dinheiro com um objetivo (viagem, reserva de emergencia, um bem). Use
          "Guardar" para registrar quanto ja separou.
        </p>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-5"
          >
            <input
              required
              placeholder="Nome (ex: Viagem)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input sm:col-span-2"
            />
            <select
              required
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              className="input"
            >
              <option value="" disabled>
                Entidade
              </option>
              {entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              placeholder="Objetivo (R$)"
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              className="input"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Ja guardado"
              value={form.currentAmount}
              onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
              className="input"
            />
            <label className="flex items-center gap-2 text-sm text-sage sm:col-span-2">
              Prazo (opcional)
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className="input"
              />
            </label>
            <button
              type="submit"
              className="btn-primary sm:col-span-3"
            >
              Salvar meta
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <div key={g.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-ink">{g.name}</h3>
                  <p className="text-xs text-sage">{g.entity?.name}</p>
                </div>
                {g.concluida && (
                  <span className="rounded-full bg-pine/10 px-2.5 py-0.5 text-xs font-semibold text-pine">
                    Concluida
                  </span>
                )}
              </div>

              <p className="mt-3 font-serif text-2xl text-ink tnum">
                {currency.format(g.currentAmount)}
              </p>
              <p className="text-xs text-sage">de {currency.format(g.targetAmount)}</p>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-pine/10">
                <div
                  className={`h-full ${g.concluida ? "bg-pine-600" : "bg-honey"}`}
                  style={{ width: `${g.percent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-sage">
                <span>{g.percent}%</span>
                {g.targetDate && <span>ate {formatDateBR(g.targetDate)}</span>}
              </div>

              <div className="mt-4 flex items-center gap-3 text-sm">
                <button
                  onClick={() => depositar(g.id)}
                  className="rounded-lg bg-honey/15 px-3 py-1.5 font-semibold text-honey-deep hover:bg-honey/25"
                >
                  Guardar
                </button>
                <button
                  onClick={() => remover(g.id)}
                  className="text-sage hover:text-clay"
                >
                  remover
                </button>
              </div>
            </div>
          ))}
          {goals.length === 0 && (
            <p className="text-sm text-sage">Nenhuma meta ainda. Crie uma em "Nova meta".</p>
          )}
        </div>
      </main>
    </div>
  );
}
