"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, mensagemDeErro } from "@/lib/http";
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
    } catch (e) {
      setErro(mensagemDeErro(e));
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
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function marcarPaga(id: string, pagar: boolean) {
    try {
      await postJson("/api/contas-a-pagar", { id, pagar });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function remover(id: string) {
    try {
      await fetch(`/api/contas-a-pagar?id=${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
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
          <h1 className="font-serif text-3xl text-ink">Contas a pagar</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancelar" : "Nova conta"}
          </button>
        </div>

        <p className="text-sm text-sage">
          Cadastre contas fixas (aluguel, assinaturas, financiamentos) com o dia do
          mes em que vencem. Marque como "Paga" quando quitar; se for recorrente, o
          controle reinicia sozinho no mes seguinte.
        </p>

        <ErroBanner mensagem={erro} />

        {bills.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-sage">Total do mes</span>
              <span className="font-medium">
                {currency.format(totalPendente)} pendente de {currency.format(totalMes)}
              </span>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-5"
          >
            <input
              required
              placeholder="Nome (ex: Aluguel)"
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
              placeholder="Valor (R$)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input"
            />
            <input
              required
              type="number"
              min="1"
              max="31"
              placeholder="Dia venc."
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              className="input"
            />
            <label className="flex items-center gap-2 text-sm text-ink/75 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                className="h-4 w-4 rounded border-pine/15"
              />
              Recorrente (todo mes)
            </label>
            <button
              type="submit"
              className="btn-primary sm:col-span-3"
            >
              Salvar conta
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((b) => (
            <div
              key={b.id}
              className={`rounded-2xl bg-cream p-5 shadow-card border ${
                b.vencido ? "border-clay/30" : "border-pine/10"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-ink">{b.name}</h3>
                  <p className="text-xs text-sage">{b.entity?.name}</p>
                </div>
                {b.pagoEsteMes && (
                  <span className="rounded-full bg-pine/10 px-2.5 py-0.5 text-xs font-semibold text-pine">
                    Paga
                  </span>
                )}
                {!b.pagoEsteMes && b.vencido && (
                  <span className="rounded-full bg-clay/12 px-2.5 py-0.5 text-xs font-semibold text-clay">
                    Vencida
                  </span>
                )}
              </div>

              <p className="mt-3 font-serif text-2xl text-ink tnum">
                {currency.format(b.amount)}
              </p>
              <p className="text-xs text-sage">
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
                    className="rounded-lg bg-pine/8 px-3 py-1.5 font-semibold text-pine hover:bg-pine/15"
                  >
                    Desmarcar
                  </button>
                ) : (
                  <button
                    onClick={() => marcarPaga(b.id, true)}
                    className="rounded-lg bg-honey/15 px-3 py-1.5 font-semibold text-honey-deep hover:bg-honey/25"
                  >
                    Marcar como paga
                  </button>
                )}
                <button
                  onClick={() => remover(b.id)}
                  className="text-sage hover:text-clay"
                >
                  remover
                </button>
              </div>
            </div>
          ))}
          {bills.length === 0 && (
            <p className="text-sm text-sage">
              Nenhuma conta cadastrada. Crie uma em "Nova conta".
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
