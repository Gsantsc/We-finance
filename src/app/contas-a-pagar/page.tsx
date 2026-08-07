"use client";

// Contas a pagar: o que tem que ser pago neste mes e nos proximos.
//
// A lista e' UNIFICADA de proposito. Conta fixa, parcela de compra, parcela de
// emprestimo e despesa avulsa apareciam em telas diferentes, mas para quem paga
// sao a mesma coisa: dinheiro que sai numa data. A origem vira etiqueta, nao
// tela separada.
//
// O status nao e' campo gravado: vem calculado de vencimento x hoje x pagamento.
// Status gravado a mao vira mentira no dia seguinte.

import { Suspense, useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import Money from "@/components/Money";
import { SkeletonLinha } from "@/components/Skeleton";
import { deleteJson, getJson, postJson, mensagemDeErro } from "@/lib/http";
import { formatDateBR, nomesMeses, rotuloMesCurto } from "@/lib/formato";
import { addMonthKey, dataDeHojeSP, mesDeHojeSP } from "@/lib/rules";

type Status = "pago" | "atrasado" | "em_aberto";
type Origem = "recorrente" | "emprestimo" | "parcela" | "avulsa";

type Item = {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  pagoEm: string | null;
  status: Status;
  origem: Origem;
  categoria: string | null;
  categoriaIcone: string | null;
  categoriaId: string | null;
  conta: string | null;
  dono: string | null;
  donoId: string | null;
  parcela: number | null;
  parcelaTotal: number | null;
  groupId: string | null;
  billId: string | null;
};

type Dados = {
  month: string;
  itens: Item[];
  resumo: { total: number; pago: number; emAberto: number; atrasado: number; quantidade: number };
  projecao: { month: string; fixas: number; parcelas: number; total: number }[];
};

const ROTULO_STATUS: Record<Status, string> = {
  pago: "Pago",
  atrasado: "Atrasado",
  em_aberto: "Em aberto",
};

const CHIP_STATUS: Record<Status, string> = {
  pago: "bg-pine/10 text-pine",
  atrasado: "bg-clay/15 text-clay",
  em_aberto: "bg-honey/15 text-honey-deep",
};

const ROTULO_ORIGEM: Record<Origem, string> = {
  recorrente: "Recorrente",
  emprestimo: "Empréstimo",
  parcela: "Parcela",
  avulsa: "Avulsa",
};

function tituloMes(chave: string) {
  const [ano, mes] = chave.split("-");
  return `${nomesMeses[Number(mes) - 1]} de ${ano}`;
}

function ContasAPagar() {
  const [mes, setMes] = useState(mesDeHojeSP);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"" | Status>("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroDono, setFiltroDono] = useState("");

  const carregar = useCallback(async (chave: string) => {
    setCarregando(true);
    try {
      // Materializa as contas fixas do mes ANTES de listar. E' um POST proprio
      // porque cria dado - o GET da lista so le. Idempotente, entao reabrir o
      // mesmo mes nao duplica nada.
      await postJson(`/api/contas-a-pagar/gerar?mes=${chave}`, {});
      setDados(await getJson<Dados>(`/api/contas-a-pagar/lista?mes=${chave}`));
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(mes);
  }, [mes, carregar]);

  async function alternarPago(item: Item) {
    setOcupado(item.id);
    try {
      await postJson("/api/contas-a-pagar/lista", {
        id: item.id,
        pago: item.status !== "pago",
        data: item.status !== "pago" ? dataDeHojeSP() : null,
      });
      await carregar(mes);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(item: Item) {
    // Em parcela, apagar "esta" e apagar "as futuras" sao acoes diferentes o
    // bastante para merecerem pergunta - nao um confirm generico.
    let escopo = "so_esta";
    if (item.groupId) {
      const futuras = confirm(
        `"${item.descricao}" é parcela ${item.parcela}/${item.parcelaTotal}.\n\n` +
          `OK = apagar esta E todas as futuras.\n` +
          `Cancelar = apagar somente esta.`
      );
      escopo = futuras ? "esta_e_futuras" : "so_esta";
    } else if (!confirm(`Apagar "${item.descricao}"?`)) {
      return;
    }
    setOcupado(item.id);
    try {
      await deleteJson(`/api/contas-a-pagar/lancamento?id=${item.id}&escopo=${escopo}`);
      await carregar(mes);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  }

  const itens = (dados?.itens ?? [])
    .filter((i) => (filtroStatus ? i.status === filtroStatus : true))
    .filter((i) => (filtroCategoria ? i.categoriaId === filtroCategoria : true))
    .filter((i) =>
      filtroDono ? (filtroDono === "compartilhado" ? !i.donoId : i.donoId === filtroDono) : true
    );

  const categorias = Array.from(
    new Map((dados?.itens ?? []).filter((i) => i.categoriaId).map((i) => [i.categoriaId!, i.categoria!])).entries()
  );
  const donos = Array.from(
    new Map((dados?.itens ?? []).filter((i) => i.donoId).map((i) => [i.donoId!, i.dono!])).entries()
  );
  const hoje = dataDeHojeSP();

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-serif text-3xl text-ink">Contas a pagar</h1>
          <p className="mt-1 text-sm text-sage">
            Tudo que sai neste mês: contas fixas, parcelas, empréstimos e gastos avulsos.
          </p>
        </div>

        <ErroBanner mensagem={erro} />

        <section className="flex flex-wrap items-center gap-2">
          <button onClick={() => setMes((m) => addMonthKey(m, -1))} className="btn-ghost" aria-label="Mês anterior">‹</button>
          <span className="min-w-[150px] text-center font-medium text-ink">{tituloMes(mes)}</span>
          <button onClick={() => setMes((m) => addMonthKey(m, 1))} className="btn-ghost" aria-label="Próximo mês">›</button>
          {mes !== mesDeHojeSP() && (
            <button onClick={() => setMes(mesDeHojeSP())} className="link-honey text-sm">
              voltar para o mês atual
            </button>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Resumo rotulo="Total do mês" valor={dados?.resumo.total ?? 0} fluxo="saida" />
          <Resumo rotulo="Já pago" valor={dados?.resumo.pago ?? 0} fluxo="saida" semCor />
          <Resumo rotulo="Em aberto" valor={dados?.resumo.emAberto ?? 0} fluxo="saida" />
          <Resumo rotulo="Atrasado" valor={dados?.resumo.atrasado ?? 0} fluxo="saida" />
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as "" | Status)} className="input w-auto text-sm" aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            <option value="em_aberto">Em aberto</option>
            <option value="atrasado">Atrasado</option>
            <option value="pago">Pago</option>
          </select>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="input w-auto text-sm" aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
            {categorias.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select value={filtroDono} onChange={(e) => setFiltroDono(e.target.value)} className="input w-auto text-sm" aria-label="Filtrar por responsável">
            <option value="">Todos</option>
            {donos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            <option value="compartilhado">Do casal</option>
          </select>
          {(filtroStatus || filtroCategoria || filtroDono) && (
            <button onClick={() => { setFiltroStatus(""); setFiltroCategoria(""); setFiltroDono(""); }} className="link-honey text-sm">
              limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-sage">
            {itens.length} de {dados?.resumo.quantidade ?? 0}
          </span>
        </section>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-pine/[0.04] text-left text-sage">
              <tr>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Descrição</th>
                <th className="px-4 py-2 font-medium">Categoria</th>
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-t border-pine/8">
                    <td colSpan={7} className="px-4 py-2"><SkeletonLinha className="h-6 w-full" /></td>
                  </tr>
                ))}

              {!carregando && itens.map((i) => (
                <tr key={i.id} className={`border-t border-pine/8 ${i.status === "pago" ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDateBR(i.vencimento)}
                    {i.status === "atrasado" && (
                      <span className="ml-1.5 text-xs text-clay">
                        {diasDeAtraso(i.vencimento, hoje)}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {i.descricao}
                    <span className="ml-2 chip bg-pine/8 text-xs text-pine/70">
                      {i.origem === "parcela" || i.origem === "emprestimo"
                        ? `${ROTULO_ORIGEM[i.origem]} ${i.parcela}/${i.parcelaTotal}`
                        : ROTULO_ORIGEM[i.origem]}
                    </span>
                    {i.conta && <span className="block text-xs text-sage">{i.conta}</span>}
                  </td>
                  <td className="px-4 py-2 text-sage">
                    {i.categoria ? `${i.categoriaIcone ?? ""} ${i.categoria}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-sage">{i.dono ?? "Do casal"}</td>
                  <td className="px-4 py-2">
                    <span className={`chip text-xs ${CHIP_STATUS[i.status]}`}>{ROTULO_STATUS[i.status]}</span>
                    {i.pagoEm && <span className="block text-xs text-sage">em {formatDateBR(i.pagoEm)}</span>}
                  </td>
                  <td className="px-4 py-2 text-right"><Money valor={i.valor} fluxo="saida" /></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => alternarPago(i)}
                      disabled={ocupado === i.id}
                      className="link-honey disabled:opacity-50"
                    >
                      {i.status === "pago" ? "Desmarcar" : "Marcar pago"}
                    </button>
                    <button
                      onClick={() => excluir(i)}
                      disabled={ocupado === i.id}
                      className="ml-3 text-sage hover:text-clay disabled:opacity-50"
                    >
                      apagar
                    </button>
                  </td>
                </tr>
              ))}

              {!carregando && itens.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sage">
                    {dados?.resumo.quantidade
                      ? "Nenhuma conta com esses filtros."
                      : "Nada a pagar neste mês."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Recorrencias aoMudar={() => carregar(mes)} />

        <section className="space-y-3">
          <div>
            <h2 className="eyebrow">Próximos 12 meses</h2>
            <p className="mt-1 text-sm text-sage">
              Só o que já é compromisso: contas fixas e parcelas lançadas. É aqui que dá para ver
              quando as parcelas acabam.
            </p>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-pine/[0.04] text-left text-sage">
                <tr>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-4 py-2 text-right font-medium">Contas fixas</th>
                  <th className="px-4 py-2 text-right font-medium">Parcelas</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(dados?.projecao ?? []).map((p) => (
                  <tr key={p.month} className="border-t border-pine/8">
                    <td className="px-4 py-2">{rotuloMesCurto(p.month)}</td>
                    <td className="px-4 py-2 text-right"><Money valor={p.fixas} fluxo="saida" semCor /></td>
                    <td className="px-4 py-2 text-right"><Money valor={p.parcelas} fluxo="saida" semCor /></td>
                    <td className="px-4 py-2 text-right font-medium"><Money valor={p.total} fluxo="saida" /></td>
                  </tr>
                ))}
                {(dados?.projecao ?? []).length === 0 && !carregando && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sage">Nada previsto.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

// As RECORRENCIAS sao o molde: cada uma vira um lancamento por mes na lista de
// cima. Editar aqui muda os meses que ainda nao foram gerados; o que ja virou
// lancamento se edita na propria lista.
function Recorrencias({ aoMudar }: { aoMudar: () => void }) {
  type Bill = { id: string; name: string; amount: number; dueDay: number; entityId: string };
  type Entity = { id: string; name: string };

  const [bills, setBills] = useState<Bill[]>([]);
  const [entidades, setEntidades] = useState<Entity[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ entityId: "", name: "", amount: "", dueDay: "10" });

  const carregar = useCallback(async () => {
    try {
      const [b, e] = await Promise.all([
        getJson<Bill[]>("/api/contas-a-pagar"),
        getJson<Entity[]>("/api/entidades"),
      ]);
      setBills(b);
      setEntidades(e);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, []);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      await postJson("/api/contas-a-pagar", {
        entityId: form.entityId,
        name: form.name,
        amount: parseFloat(form.amount.replace(",", ".")),
        dueDay: parseInt(form.dueDay, 10),
        recurring: true,
      });
      setForm({ entityId: "", name: "", amount: "", dueDay: "10" });
      await carregar();
      aoMudar();
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(b: Bill) {
    if (!confirm(`Parar de gerar "${b.name}" todo mês?\n\nOs lançamentos já criados continuam.`)) return;
    try {
      await deleteJson(`/api/contas-a-pagar?id=${b.id}`);
      await carregar();
      aoMudar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <section className="space-y-3">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="eyebrow flex items-center gap-1.5">
        Contas fixas que se repetem {aberto ? "▲" : "▼"}
      </button>

      {aberto && (
        <div className="card space-y-4 p-5">
          <p className="text-sm text-sage">
            Cada uma vira um lançamento por mês na lista acima. Apagar aqui só para de gerar nos
            próximos meses — o que já foi lançado continua.
          </p>

          <ErroBanner mensagem={erro} />

          <form onSubmit={criar} className="grid gap-3 sm:grid-cols-5">
            <input required placeholder="Nome (ex: Aluguel)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="input sm:col-span-2" />
            <select required value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} className="input">
              <option value="" disabled>De quem é</option>
              {entidades.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
            <input required type="number" step="0.01" min="0" placeholder="Valor" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
            <input required type="number" min="1" max="31" placeholder="Dia" value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className="input" />
            <button type="submit" disabled={salvando} className="btn-primary sm:col-span-5 disabled:opacity-60">
              {salvando ? "Salvando..." : "Adicionar conta fixa"}
            </button>
          </form>

          <ul className="divide-y divide-pine/8">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {b.name}
                  <span className="ml-2 text-xs text-sage">todo dia {b.dueDay}</span>
                </span>
                <Money valor={b.amount} fluxo="saida" />
                <button onClick={() => remover(b)} className="text-sage hover:text-clay">apagar</button>
              </li>
            ))}
            {bills.length === 0 && <li className="py-3 text-sm text-sage">Nenhuma conta fixa cadastrada.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

function diasDeAtraso(vencimento: string, hoje: string): number {
  const a = new Date(`${vencimento}T12:00:00`);
  const b = new Date(`${hoje}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function Resumo({
  rotulo,
  valor,
  fluxo,
  semCor,
}: {
  rotulo: string;
  valor: number;
  fluxo: "saida";
  semCor?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{rotulo}</p>
      <p className="mt-1.5 font-serif text-2xl">
        <Money valor={valor} fluxo={fluxo} semCor={semCor} />
      </p>
    </div>
  );
}

export default function ContasAPagarPage() {
  return (
    <Suspense>
      <ContasAPagar />
    </Suspense>
  );
}
