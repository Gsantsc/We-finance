"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, mensagemDeErro } from "@/lib/http";
import { formatDateBR } from "@/lib/formato";
import { dataDeHojeSP, installmentPlanCents, type InstallmentMode } from "@/lib/rules";
import { SkeletonLinha } from "@/components/Skeleton";
import Money from "@/components/Money";

type Category = { id: string; name: string; icon: string };
type Account = { id: string; name: string; entity?: { id: string; name: string } | null };
type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account: Account;
  category?: Category | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formInicial = () => ({
  accountId: "",
  categoryId: "",
  description: "",
  amount: "",
  date: dataDeHojeSP(),
  installments: "1",
  // "fixed" = o valor digitado e' o de cada parcela (emprestimo). Default por
  // ser o caso em que dividir daria errado sem o usuario perceber.
  installmentMode: "fixed" as InstallmentMode,
});

const PAGINA = 50;

export default function TransacoesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fim, setFim] = useState(false);
  const [form, setForm] = useState(formInicial);

  // Pagina o historico: carrega uma janela e vai buscando o resto sob demanda,
  // em vez de trazer tudo de uma vez.
  async function load() {
    try {
      const [txRes, accRes, catRes] = await Promise.all([
        getJson<Transaction[]>(`/api/transacoes?limit=${PAGINA}`),
        getJson<Account[]>("/api/contas"),
        getJson<Category[]>("/api/categorias"),
      ]);
      setTransactions(txRes);
      setAccounts(accRes);
      setCategories(catRes);
      setFim(txRes.length < PAGINA);
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const mais = await getJson<Transaction[]>(
        `/api/transacoes?limit=${PAGINA}&offset=${transactions.length}`
      );
      setTransactions((atual) => [...atual, ...mais]);
      if (mais.length < PAGINA) setFim(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregandoMais(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setForm(formInicial());
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setForm({
      accountId: t.account?.id || "",
      categoryId: t.category?.id || "",
      description: t.description,
      amount: String(t.amount),
      date: t.date.slice(0, 10),
      installments: "1",
      installmentMode: "fixed",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Sem trava, dois cliques (ou Enter duas vezes) gravavam DUAS transacoes e
    // aplicavam o delta no saldo da conta duas vezes.
    if (enviando) return;
    setEnviando(true);
    const parcelas = Math.max(1, parseInt(form.installments || "1", 10));
    const payload = {
      accountId: form.accountId,
      categoryId: form.categoryId || null,
      description: form.description,
      amount: parseFloat(form.amount.replace(",", ".")),
      date: form.date,
    };

    try {
      await postJson(
        "/api/transacoes",
        editingId
          ? { id: editingId, ...payload }
          : {
              ...payload,
              ...(parcelas > 1
                ? { installments: parcelas, installmentMode: form.installmentMode }
                : {}),
            }
      );
      resetForm();
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  const parcelas = Math.max(1, parseInt(form.installments || "1", 10));
  // Previa do que sera gravado - a mesma funcao que o servidor usa, para o
  // usuario ver a diferenca entre dividir o total e repetir a parcela.
  const centavosDigitados = Math.round(
    Math.abs(parseFloat(form.amount.replace(",", ".")) || 0) * 100
  );
  const previa =
    !editingId && parcelas > 1 && centavosDigitados > 0
      ? installmentPlanCents(centavosDigitados, parcelas, form.installmentMode)
      : null;

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl text-ink">Lançamentos</h1>
          <div className="flex items-center gap-2">
            <Link href="/regras" className="btn-ghost">Regras</Link>
            <Link href="/importar" className="btn-ghost">Importar CSV</Link>
            <button onClick={() => (showForm ? resetForm() : setShowForm(true))} className="btn-primary">
              {showForm ? "Cancelar" : "Nova transação"}
            </button>
          </div>
        </div>

        <ErroBanner mensagem={erro} />

        {showForm && (
          <form onSubmit={handleSubmit} className="grid gap-3 card p-5 sm:grid-cols-3">
            <select
              required
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              className="input"
            >
              <option value="" disabled>
                Conta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.entity ? ` (${a.entity.name})` : ""}
                </option>
              ))}
            </select>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="input"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="input"
            />
            <input
              required
              placeholder="Descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input sm:col-span-2"
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder={
                editingId || parcelas <= 1
                  ? "Valor (negativo = gasto)"
                  : form.installmentMode === "split"
                  ? "Valor total da compra"
                  : "Valor de cada parcela"
              }
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input"
            />
            {!editingId && (
              <label className="flex items-center gap-2 text-sm text-ink/75">
                <span className="whitespace-nowrap">Parcelas</span>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={form.installments}
                  onChange={(e) => setForm({ ...form, installments: e.target.value })}
                  className="input"
                />
              </label>
            )}
            {!editingId && parcelas > 1 && (
              <fieldset className="sm:col-span-3">
                <legend className="mb-1 text-sm text-ink/75">Como ler o valor</legend>
                <div className="flex flex-wrap gap-4 text-sm text-ink/75">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="installmentMode"
                      value="fixed"
                      checked={form.installmentMode === "fixed"}
                      onChange={() => setForm({ ...form, installmentMode: "fixed" })}
                    />
                    Parcela fixa / emprestimo (valor x {parcelas})
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="installmentMode"
                      value="split"
                      checked={form.installmentMode === "split"}
                      onChange={() => setForm({ ...form, installmentMode: "split" })}
                    />
                    Compra em {parcelas}x (dividir o total)
                  </label>
                </div>
              </fieldset>
            )}
            {previa && (
              <p className="text-xs text-sage sm:col-span-3">
                Vira {parcelas} lancamentos mensais a partir da data:{" "}
                <strong>
                  {parcelas}x de <Money valor={previa[0] / 100} fluxo="neutro" semCor />
                </strong>
                {previa[parcelas - 1] !== previa[0] && (
                  <> (a última de <Money valor={previa[parcelas - 1] / 100} fluxo="neutro" semCor />)</>
                )}
                {" — total "}
                <Money valor={previa.reduce((s, x) => s + x, 0) / 100} fluxo="neutro" semCor />.
              </p>
            )}
            <button type="submit" disabled={enviando} className="btn-primary sm:col-span-3 disabled:opacity-60">
              {enviando
                ? "Salvando..."
                : editingId
                ? "Salvar alteração"
                : parcelas > 1
                ? `Salvar em ${parcelas}x`
                : "Salvar transação"}
            </button>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-pine/[0.04] text-left text-sage">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2">Conta</th>
                <th className="px-4 py-2">Entidade</th>
                <th className="px-4 py-2">Categoria</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-pine/8">
                  <td className="px-4 py-2 text-sage">{formatDateBR(t.date)}</td>
                  <td className="px-4 py-2">
                    {t.description}
                    {t.installmentTotal && t.installmentTotal > 1 && (
                      <span className="ml-2 chip bg-pine/8 text-pine/70">
                        {t.installmentNumber}/{t.installmentTotal}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sage">{t.account?.name}</td>
                  <td className="px-4 py-2 text-sage">{t.account?.entity?.name || "-"}</td>
                  <td className="px-4 py-2 text-sage">
                    {t.category ? `${t.category.icon} ${t.category.name}` : "-"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${
                      t.amount < 0 ? "text-clay" : "text-pine-600"
                    }`}
                  >
                    <Money valor={t.amount} fluxo="auto" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => startEdit(t)} className="link-honey">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {carregando &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-t border-pine/8">
                    <td colSpan={7} className="px-4 py-2">
                      <SkeletonLinha className="h-6 w-full" />
                    </td>
                  </tr>
                ))}
              {!carregando && transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sage">
                    Nenhuma transação ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!carregando && transactions.length > 0 && (
          <div className="flex items-center justify-center gap-3 text-sm text-sage">
            <span>{transactions.length} lancamento(s) carregado(s)</span>
            {!fim && (
              <button onClick={carregarMais} disabled={carregandoMais} className="btn-ghost">
                {carregandoMais ? "Carregando..." : "Carregar mais"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
