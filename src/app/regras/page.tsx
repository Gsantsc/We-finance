"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import AcoesDaLinha from "@/components/AcoesDaLinha";
import { getJson, postJson, patchJson, deleteJson, mensagemDeErro } from "@/lib/http";

type Category = { id: string; name: string; icon: string };
type Rule = {
  id: string;
  matchType: "contains" | "starts_with" | "regex";
  pattern: string;
  categoryId: string;
  priority: number;
  active: boolean;
};

const matchLabel: Record<Rule["matchType"], string> = {
  contains: "contem",
  starts_with: "comeca com",
  regex: "regex",
};

export default function RegrasPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ matchType: "contains", pattern: "", categoryId: "", priority: "0" });
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Edita no MESMO formulario de cima, que ja esta na tela - abrir um segundo
  // lugar para editar seria pedir para a pessoa reaprender o layout.
  function editar(r: Rule) {
    setEditandoId(r.id);
    setForm({
      matchType: r.matchType,
      pattern: r.pattern,
      categoryId: r.categoryId,
      priority: String(r.priority),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm({ matchType: "contains", pattern: "", categoryId: "", priority: "0" });
  }

  const catById = new Map(categories.map((c) => [c.id, c]));

  async function load() {
    try {
      const [r, c] = await Promise.all([
        getJson<Rule[]>("/api/regras"),
        getJson<Category[]>("/api/categorias"),
      ]);
      setRules(r);
      setCategories(c);
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postJson("/api/regras", {
        matchType: form.matchType,
        pattern: form.pattern,
        categoryId: form.categoryId,
        priority: parseInt(form.priority || "0", 10),
      });
      setForm({ matchType: "contains", pattern: "", categoryId: "", priority: "0" });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function alternar(rule: Rule) {
    try {
      await fetch("/api/regras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, active: !rule.active }),
      });
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function remover(id: string) {
    try {
      await deleteJson(`/api/regras?id=${id}`);
      await load();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <p className="eyebrow text-honey-deep">Automatizar</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Categorias automáticas</h1>
          <p className="mt-1 text-sm text-sage">
            Quando a descrição de um lançamento casa com o texto, a categoria é preenchida
            sozinha — na importação de planilha e nos lançamentos sem categoria. A regra de
            maior prioridade vence.
          </p>
        </div>

        <ErroBanner mensagem={erro} />

        <form onSubmit={criar} className="grid gap-3 card p-5 sm:grid-cols-6">
          <select
            value={form.matchType}
            onChange={(e) => setForm({ ...form, matchType: e.target.value })}
            className="input sm:col-span-1"
          >
            <option value="contains">Contem</option>
            <option value="starts_with">Comeca com</option>
            <option value="regex">Regex</option>
          </select>
          <input
            required
            placeholder='Texto (ex: "ifood")'
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            className="input sm:col-span-2"
          />
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="input sm:col-span-2"
          >
            <option value="" disabled>Categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary sm:col-span-1">
            {editandoId ? "Salvar" : "Criar"}
          </button>
          {editandoId && (
            <button type="button" onClick={cancelarEdicao} className="btn-ghost sm:col-span-6">
              Cancelar edição
            </button>
          )}
        </form>

        <div className="card divide-y divide-pine/8">
          {rules.map((r) => {
            const cat = catById.get(r.categoryId);
            return (
              <div key={r.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${r.active ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    Descricao <span className="text-sage">{matchLabel[r.matchType]}</span>{" "}
                    <strong>&ldquo;{r.pattern}&rdquo;</strong>{" "}
                    <span className="text-sage">→</span>{" "}
                    {cat ? `${cat.icon} ${cat.name}` : "categoria removida"}
                  </p>
                  {r.priority > 0 && <p className="text-xs text-sage">prioridade {r.priority}</p>}
                </div>
                <button onClick={() => alternar(r)} className="text-sm font-medium text-pine hover:text-honey-deep">
                  {r.active ? "Desativar" : "Ativar"}
                </button>
                <AcoesDaLinha
                  tipo="a regra"
                  nome={r.pattern}
                  aoEditar={() => editar(r)}
                  aoApagar={() => remover(r.id)}
                />
              </div>
            );
          })}
          {rules.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-sage">
              Nenhuma regra ainda. Crie uma acima — ex: descrição contém &ldquo;ifood&rdquo; → Alimentação.
            </p>
          )}
        </div>

        <p className="text-sm text-sage">
          Dica: importe uma planilha em{" "}
          <Link href="/importar" className="link-honey">Importar CSV</Link> e as regras
          categorizam tudo de uma vez.
        </p>
      </main>
    </div>
  );
}
