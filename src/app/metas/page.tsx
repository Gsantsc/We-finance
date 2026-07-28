"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, deleteJson, mensagemDeErro } from "@/lib/http";
import { currency, formatDateBR } from "@/lib/formato";
import { SkeletonLinha } from "@/components/Skeleton";
import { dataDeHojeSP, lerValorBR } from "@/lib/rules";

type Entity = { id: string; name: string };
type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyAmount: number;
  targetDate: string | null;
  percent: number;
  restante: number;
  concluida: boolean;
  entity: Entity | null;
};
// v_goal_progress: total e aporte do mes derivados dos lancamentos de aporte.
type Progresso = {
  goalId: string;
  contributedTotal: number;
  contributedThisMonth: number;
  restante: number;
  percent: number;
  concluida: boolean;
};

function SkeletonMeta() {
  return (
    <div className="card p-5">
      <SkeletonLinha className="h-4 w-32" />
      <SkeletonLinha className="mt-2 h-3 w-20" />
      <SkeletonLinha className="mt-4 h-7 w-28" />
      <SkeletonLinha className="mt-3 h-2 w-full" />
      <SkeletonLinha className="mt-4 h-8 w-24" />
    </div>
  );
}

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progresso, setProgresso] = useState<Record<string, Progresso>>({});
  const [entities, setEntities] = useState<Entity[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    entityId: "",
    name: "",
    targetAmount: "",
    currentAmount: "",
    monthlyAmount: "",
    targetDate: "",
  });

  async function load() {
    try {
      const [goalRes, entRes, progRes] = await Promise.all([
        getJson<Goal[]>("/api/metas"),
        getJson<Entity[]>("/api/entidades"),
        getJson<Progresso[]>("/api/metas/aportes"),
      ]);
      setGoals(goalRes);
      setEntities(entRes);
      setProgresso(Object.fromEntries(progRes.map((p) => [p.goalId, p])));
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
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
        monthlyAmount: parseFloat(form.monthlyAmount || "0"),
        targetDate: form.targetDate || null,
      });
      setForm({ entityId: "", name: "", targetAmount: "", currentAmount: "", monthlyAmount: "", targetDate: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  // Grava um APORTE (linha datada em goal_contributions), nao um numero solto.
  // E' o que permite responder "quanto entrou neste mes" no dashboard.
  async function depositar(id: string) {
    const valor = prompt("Quanto guardar nesta meta? (use negativo para tirar)");
    if (valor === null) return;
    const n = lerValorBR(valor);
    if (n === null) {
      setErro(`Nao entendi o valor "${valor}". Use por exemplo 1.500,50 ou 1500,50.`);
      return;
    }
    if (n === 0) return;
    try {
      await postJson("/api/metas/aportes", {
        goalId: id,
        amount: n,
        date: dataDeHojeSP(),
      });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function remover(id: string, nome: string) {
    // fetch cru nao levanta em 4xx/5xx: a tela recarregava como se tivesse
    // apagado, e a meta continuava la. deleteJson passa pelo mesmo unwrap dos
    // outros verbos.
    if (!confirm(`Remover a meta "${nome}"? Os aportes registrados vao junto.`)) return;
    try {
      await deleteJson(`/api/metas?id=${id}`);
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
            className="grid gap-3 card p-5 sm:grid-cols-6"
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
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Investimento/mes"
              value={form.monthlyAmount}
              onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })}
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
              className="btn-primary sm:col-span-4"
            >
              Salvar meta
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {carregando && Array.from({ length: 3 }, (_, i) => <SkeletonMeta key={i} />)}
          {!carregando && goals.map((g) => {
            // A view manda no numero; o /api/metas so completa entidade e prazo.
            const p = progresso[g.id];
            const guardado = p?.contributedTotal ?? g.currentAmount;
            const restante = p?.restante ?? g.restante;
            const percent = p?.percent ?? g.percent;
            const concluida = p?.concluida ?? g.concluida;
            return (
            <div key={g.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-ink">{g.name}</h3>
                  <p className="text-xs text-sage">{g.entity?.name}</p>
                </div>
                {concluida && (
                  <span className="rounded-full bg-pine/10 px-2.5 py-0.5 text-xs font-semibold text-pine">
                    Concluida
                  </span>
                )}
              </div>

              <p className="mt-3 font-serif text-2xl text-ink tnum">
                {currency.format(guardado)}
              </p>
              <p className="text-xs text-sage">de {currency.format(g.targetAmount)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-sage">Falta</p>
                  <p className="font-semibold text-ink tnum">{currency.format(restante)}</p>
                </div>
                <div>
                  <p className="text-xs text-sage">Aporte no mes</p>
                  <p className="font-semibold text-ink tnum">
                    {currency.format(p?.contributedThisMonth ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-sage">Planejado/mes</p>
                  <p className="font-semibold text-ink tnum">{currency.format(g.monthlyAmount || 0)}</p>
                </div>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-pine/10">
                <div
                  className={`h-full ${concluida ? "bg-pine-600" : "bg-honey"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-sage">
                <span>{percent}%</span>
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
                  onClick={() => remover(g.id, g.name)}
                  className="text-sage hover:text-clay"
                >
                  remover
                </button>
              </div>
            </div>
            );
          })}
          {!carregando && goals.length === 0 && (
            <p className="text-sm text-sage">Nenhuma meta ainda. Crie uma em "Nova meta".</p>
          )}
        </div>
      </main>
    </div>
  );
}
