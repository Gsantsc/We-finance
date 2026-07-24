"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson } from "@/lib/http";
import { currency } from "@/lib/formato";
import { sortBills } from "@/lib/rules";

type Entity = { id: string; name: string };
type Bill = {
  id: string;
  entityId: string;
  name: string;
  amount: number;
  dueDay: number;
  recurring: boolean;
  lastPaidAt: string | null;
  pagoEsteMes: boolean;
  vencido: boolean;
  diasAteVencer: number | null;
  vencimentoISO: string;
  entity: Entity | null;
};

export default function ContasAPagarPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [erro, setErro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entityId: "", name: "", amount: "", dueDay: "", recurring: true });

  async function load() {
    try {
      const [billRes, entRes] = await Promise.all([
        getJson<Bill[]>("/api/contas-a-pagar"),
        getJson<Entity[]>("/api/entidades"),
      ]);
      setBills(billRes);
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
      await postJson("/api/contas-a-pagar", {
        entityId: form.entityId,
        name: form.name,
        amount: parseFloat(form.amount || "0"),
        dueDay: parseInt(form.dueDay || "0", 10),
        recurring: form.recurring,
      });
      setForm({ entityId: "", name: "", amount: "", dueDay: "", recurring: true });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function marcarPaga(id: string, pagar: boolean) {
    try {
      await postJson("/api/contas-a-pagar", { id, pagar });
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function remover(id: string) {
    try {
      await fetch(`/api/contas-a-pagar?id=${id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const ordenadas = sortBills(bills);
  const totalMes = bills.reduce((s, b) => s + b.amount, 0);
  const totalPendente = bills.filter((b) => !b.pagoEsteMes).reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Contas a pagar</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancelar" : "Nova conta"}
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Cadastre contas fixas (aluguel, assinaturas, financiamentos) com o dia do
          mes em que vencem. Marque como "Paga" quando quitar; se for recorrente, o
          controle reinicia sozinho no mes seguinte.
        </p>

        <ErroBanner mensagem={erro} />

        {bills.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Total do mes</span>
              <span className="font-medium">
                {currency.format(totalPendente)} pendente de {currency.format(totalMes)}
              </span>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-5"
          >
            <input
              required
              placeholder="Nome (ex: Aluguel)"
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
              placeholder="Valor (R$)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="1"
              max="31"
              placeholder="Dia venc."
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Recorrente (todo mes)
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3"
            >
              Salvar conta
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${
                b.vencido ? "border-red-200" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{b.name}</h3>
                  <p className="text-xs text-slate-500">{b.entity?.name}</p>
                </div>
                {b.pagoEsteMes && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Paga
                  </span>
                )}
                {!b.pagoEsteMes && b.vencido && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    Vencida
                  </span>
                )}
              </div>

              <p className="mt-3 text-xl font-semibold text-slate-900">
                {currency.format(b.amount)}
              </p>
              <p className="text-xs text-slate-500">
                Vence dia {b.dueDay}
                {b.recurring ? " (todo mes)" : ""}
                {!b.pagoEsteMes && b.diasAteVencer !== null && (
                  <>
                    {" "}
                    &middot;{" "}
                    {b.diasAteVencer > 0
                      ? `em ${b.diasAteVencer} dia${b.diasAteVencer === 1 ? "" : "s"}`
                      : b.diasAteVencer === 0
                      ? "vence hoje"
                      : `${-b.diasAteVencer} dia${-b.diasAteVencer === 1 ? "" : "s"} atrasada`}
                  </>
                )}
              </p>

              <div className="mt-4 flex items-center gap-3 text-sm">
                {b.pagoEsteMes ? (
                  <button
                    onClick={() => marcarPaga(b.id, false)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200"
                  >
                    Desmarcar
                  </button>
                ) : (
                  <button
                    onClick={() => marcarPaga(b.id, true)}
                    className="rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Marcar como paga
                  </button>
                )}
                <button
                  onClick={() => remover(b.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  remover
                </button>
              </div>
            </div>
          ))}
          {bills.length === 0 && (
            <p className="text-sm text-slate-400">
              Nenhuma conta cadastrada. Crie uma em "Nova conta".
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
