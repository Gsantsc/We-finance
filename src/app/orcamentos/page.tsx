"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, deleteJson, mensagemDeErro } from "@/lib/http";
import { currency, nomesMeses } from "@/lib/formato";
import { budgetBarColor, lerValorBR } from "@/lib/rules";
import Money from "@/components/Money";
import AcoesDaLinha from "@/components/AcoesDaLinha";
import { formatarDinheiro } from "@/lib/dinheiro";

type Entity = { id: string; name: string };
type Category = { id: string; name: string; icon: string; isIncome?: boolean };
type Budget = {
  id: string;
  entityId: string;
  categoryId: string;
  amount: number;
  gasto: number;
  restante: number;
  percentUsado: number;
  entity: Entity | null;
  category: { id: string; name: string; icon: string };
};

const agora = new Date();

export default function OrcamentosPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState(agora.getMonth() + 1);
  const [year, setYear] = useState(agora.getFullYear());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entityId: "", categoryId: "", amount: "" });

  async function load() {
    try {
      const [budRes, entRes, catRes] = await Promise.all([
        getJson<Budget[]>(`/api/orcamentos?month=${month}&year=${year}`),
        getJson<Entity[]>("/api/entidades"),
        getJson<Category[]>("/api/categorias"),
      ]);
      setBudgets(budRes);
      setEntities(entRes);
      setCategories(catRes);
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  function editar(b: Budget) {
    // Orcamento e' upsert por (divisão, categoria, mês): reabrir o formulario
    // com os mesmos campos e salvar substitui o valor.
    setEditandoId(b.id);
    setForm({
      entityId: b.entity?.id ?? "",
      categoryId: b.category.id,
      amount: String(b.amount),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm({ entityId: "", categoryId: "", amount: "" });
    setShowForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postJson("/api/orcamentos", {
        entityId: form.entityId,
        categoryId: form.categoryId,
        month,
        year,
        amount: lerValorBR(form.amount || "0") ?? 0,
      });
      cancelarEdicao();
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function remover(id: string) {
    try {
      // fetch cru nao levanta em 4xx/5xx: a tela recarregava como se tivesse
      // apagado, e o orcamento continuava la.
      await deleteJson(`/api/orcamentos?id=${id}`);
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  const totalOrcado = budgets.reduce((s, b) => s + b.amount, 0);
  const totalGasto = budgets.reduce((s, b) => s + b.gasto, 0);
  const despesaCategorias = categories.filter((c) => !c.isIncome);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl text-ink">Orçamento do mês</h1>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="input"
            >
              {nomesMeses.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={() => (showForm ? cancelarEdicao() : setShowForm(true))}
              className="btn-primary"
            >
              {showForm ? "Cancelar" : "Novo orçamento"}
            </button>
          </div>
        </div>

        <p className="text-sm text-sage">
          Defina quanto pretende gastar por categoria no mes. O app compara com o que
          ja foi gasto (a partir das transacoes daquela entidade e categoria).
        </p>

        <ErroBanner mensagem={erro} />

        {budgets.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-sage">Total do mês</span>
              <span className="font-medium">
                <Money valor={totalGasto} fluxo="saida" /> de <Money valor={totalOrcado} fluxo="neutro" semCor />
              </span>
            </div>
            <Barra percent={totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0} />
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 card p-5 sm:grid-cols-4"
          >
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
            <select
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="input"
            >
              <option value="" disabled>
                Categoria
              </option>
              {despesaCategorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor do mês"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input"
            />
            <button
              type="submit"
              className="btn-primary"
            >
              Salvar
            </button>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {budgets.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-ink">
                    {b.category.icon} {b.category.name}
                  </h3>
                  <p className="text-xs text-sage">{b.entity?.name}</p>
                </div>
                <AcoesDaLinha
                  tipo="o orçamento de"
                  nome={b.category.name}
                  aoEditar={() => editar(b)}
                  aoApagar={() => remover(b.id)}
                />
              </div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <Money valor={b.gasto} fluxo="saida" className="font-medium" />
                <span className="text-sage">de <Money valor={b.amount} fluxo="neutro" semCor /></span>
              </div>
              <Barra percent={b.percentUsado} />
              <p
                className={`mt-1 text-xs ${
                  b.restante < 0 ? "text-clay" : "text-sage"
                }`}
              >
                {b.restante < 0
                  ? `Estourou em ${formatarDinheiro(b.restante, "neutro")}`
                  : `Resta ${formatarDinheiro(b.restante, "neutro")}`}
              </p>
            </div>
          ))}
          {budgets.length === 0 && (
            <p className="text-sm text-sage">
              Nenhum orcamento neste mes. Crie um em "Novo orçamento".
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// Barra de progresso: verde ate 80%, ambar ate 100%, vermelho se estourar.
const CORES_BARRA = { emerald: "bg-pine-600", amber: "bg-honey", red: "bg-clay" };

function Barra({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const cor = CORES_BARRA[budgetBarColor(percent)];
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-pine/10">
      <div className={`h-full ${cor}`} style={{ width: `${p}%` }} />
    </div>
  );
}
