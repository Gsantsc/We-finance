"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";
import { currency } from "@/lib/formato";

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
          <h1 className="text-2xl font-semibold">Metas de economia</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancelar" : "Nova meta"}
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Junte dinheiro com um objetivo (viagem, reserva de emergencia, um bem). Use
          "Guardar" para registrar quanto ja separou.
        </p>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-5"
          >
            <input
              required
              placeholder="Nome (ex: Viagem)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <select
              required
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Ja guardado"
              value={form.currentAmount}
              onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-500 sm:col-span-2">
              Prazo (opcional)
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3"
            >
              Salvar meta
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{g.name}</h3>
                  <p className="text-xs text-slate-500">{g.entity?.name}</p>
                </div>
                {g.concluida && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Concluida
                  </span>
                )}
              </div>

              <p className="mt-3 text-xl font-semibold text-slate-900">
                {currency.format(g.currentAmount)}
              </p>
              <p className="text-xs text-slate-500">de {currency.format(g.targetAmount)}</p>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${g.concluida ? "bg-emerald-500" : "bg-indigo-500"}`}
                  style={{ width: `${g.percent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>{g.percent}%</span>
                {g.targetDate && <span>ate {new Date(g.targetDate).toLocaleDateString("pt-BR")}</span>}
              </div>

              <div className="mt-4 flex items-center gap-3 text-sm">
                <button
                  onClick={() => depositar(g.id)}
                  className="rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Guardar
                </button>
                <button
                  onClick={() => remover(g.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  remover
                </button>
              </div>
            </div>
          ))}
          {goals.length === 0 && (
            <p className="text-sm text-slate-400">Nenhuma meta ainda. Crie uma em "Nova meta".</p>
          )}
        </div>
      </main>
    </div>
  );
}
