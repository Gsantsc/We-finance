"use client";

// Dashboard mes a mes.
//
// Um request por mes (/api/dashboard?mes=AAAA-MM) e NADA e' somado aqui: os
// numeros ja vem agregados pelas views. O dashboard antigo puxava ate 2000
// transacoes e recalculava tudo no cliente, o que ficava lento e podia divergir
// da tela de lancamentos. Mes ja visitado fica em cache, entao voltar e' instantaneo.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import GraficoEvolucao, { type PontoEvolucao } from "@/components/GraficoEvolucao";
import { Recarregando, SkeletonCards, SkeletonTabela } from "@/components/Skeleton";
import { getJson, mensagemDeErro } from "@/lib/http";
import { currency, formatDateBR, nomesMeses, rotuloMesCurto } from "@/lib/formato";
import { addMonthKey, mesDeHojeSP } from "@/lib/rules";

type Coluna = {
  key: string;
  nome: string;
  isTotal: boolean;
  salario: number;
  va: number;
  vr: number;
  parcelas: number;
  contasFixas: number;
  dividas: number;
  investido: number;
  aportes: number;
  receitas: number;
  despesas: number;
  sobra: number;
};

type Meta = {
  id: string;
  nome: string;
  alvo: number;
  guardado: number;
  restante: number;
  aporteDoMes: number;
  planejadoMes: number;
  percent: number;
  targetDate: string | null;
};

type Dados = {
  month: string;
  mesesDisponiveis: string[];
  colunas: Coluna[];
  evolucao: PontoEvolucao[];
  categorias: { id: string | null; nome: string; icone: string | null; total: number }[];
  metas: Meta[];
  contas: { patrimonio: number; investimentos: number; total: number; semEntidade: number };
  bills: { id: string; name: string; amount: number; dueDay: number }[];
  ultimosLancamentos: any[];
};

const mesAtual = mesDeHojeSP;

// Quanto tempo um mes ja carregado continua valendo sem ir ao servidor.
const TTL_CACHE_MS = 60_000;

function tituloMes(chave: string) {
  const [ano, mes] = chave.split("-");
  return `${nomesMeses[Number(mes) - 1]} de ${ano}`;
}

// As 6 linhas do resumo objetivo, na ordem em que se le: o que entra, o que
// compromete, o que sobra.
const LINHAS: { rotulo: string; campo: keyof Coluna; dica?: string; destaque?: boolean }[] = [
  { rotulo: "Salário", campo: "salario", dica: "Entradas na categoria Salário" },
  { rotulo: "VA", campo: "va", dica: "Entradas em conta Vale alimentação" },
  { rotulo: "VR", campo: "vr", dica: "Entradas em conta Vale refeição" },
  { rotulo: "Dívidas", campo: "dividas", dica: "Parcelas do mês + contas fixas em aberto" },
  { rotulo: "Investimentos", campo: "investido", dica: "Entradas em conta de investimento" },
  { rotulo: "Sobra", campo: "sobra", dica: "Renda − saídas − contas fixas − aportes", destaque: true },
];

function MetricCard(props: { label: string; value: number; detail?: string; tone?: "good" | "bad" }) {
  const cor = props.tone === "good" ? "text-pine-600" : props.tone === "bad" ? "text-clay" : "text-ink";
  return (
    <div className="card p-5">
      <p className="eyebrow">{props.label}</p>
      <p className={`mt-2 font-serif text-3xl ${cor}`}>{currency.format(props.value)}</p>
      {props.detail && <p className="mt-1 text-xs text-sage">{props.detail}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [mes, setMes] = useState(mesAtual);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const cache = useRef(new Map<string, { dados: Dados; em: number }>());
  // Bump manual/automatico que forca uma nova busca ignorando o cache.
  const [revalidacao, setRevalidacao] = useState(0);

  // Guarda qual mes e' o pedido VALIDO agora. Sem isso, clicar rapido em "›"
  // deixa a resposta mais LENTA chegar por ultimo e sobrescrever a do mes que o
  // usuario esta vendo - numeros de um mes sob o titulo de outro, sem erro nenhum.
  const pedidoAtual = useRef(mes);

  // O cache existe para a troca de mes ser instantanea, mas dado de dinheiro nao
  // pode envelhecer calado: lancar um gasto em /transacoes e voltar mostrava o
  // numero velho ate dar F5. Ao reabrir a aba, o que estiver vencido e' descartado.
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState !== "visible") return;
      const agora = Date.now();
      for (const [chave, item] of cache.current) {
        if (agora - item.em > TTL_CACHE_MS) cache.current.delete(chave);
      }
      setRevalidacao((n) => n + 1);
    }
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  useEffect(() => {
    pedidoAtual.current = mes;
    let cancelado = false;

    const emCache = cache.current.get(mes);
    if (emCache && Date.now() - emCache.em <= TTL_CACHE_MS) {
      setDados(emCache.dados);
      setCarregando(false);
      setErro("");
      return;
    }

    setCarregando(true);
    getJson<Dados>(`/api/dashboard?mes=${mes}`)
      .then((res) => {
        cache.current.set(mes, { dados: res, em: Date.now() });
        if (cancelado || pedidoAtual.current !== mes) return;
        setDados(res);
        setErro("");
      })
      .catch((e) => {
        if (cancelado || pedidoAtual.current !== mes) return;
        // Sem dado do mes pedido, mostrar o do mes anterior sob o titulo novo
        // seria pior que mostrar nada: o usuario leria dinheiro do mes errado.
        setDados(null);
        setErro(mensagemDeErro(e));
      })
      .finally(() => {
        if (!cancelado && pedidoAtual.current === mes) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [mes, revalidacao]);

  const casal = dados?.colunas.find((c) => c.isTotal);
  const pessoas = dados?.colunas.filter((c) => !c.isTotal) ?? [];
  // Primeira carga = esqueleto. Troca de mes = mantem o mes anterior esmaecido.
  const primeiraCarga = carregando && !dados;
  const meses = dados?.mesesDisponiveis?.length ? dados.mesesDisponiveis : [mes];

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <ErroBanner mensagem={erro} />

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-honey-deep">Painel do mês</p>
            <h1 className="mt-1 font-serif text-4xl text-ink">{tituloMes(mes)}</h1>
            <p className="mt-1 text-sm text-sage">
              {dados ? `${dados.contas.total} conta(s) cadastrada(s).` : "Carregando..."}
            </p>
          </div>
          <Link href="/novo" className="btn-primary">+ Lançar gasto</Link>
        </section>

        {/* Filtro unico acima de tudo que ele afeta - nunca dentro de um card. */}
        <section className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMes((m) => addMonthKey(m, -1))}
            className="btn-ghost"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="input w-auto"
            aria-label="Mês exibido"
          >
            {(meses.includes(mes) ? meses : [mes, ...meses]).map((m) => (
              <option key={m} value={m}>{rotuloMesCurto(m)}</option>
            ))}
          </select>
          <button
            onClick={() => setMes((m) => addMonthKey(m, 1))}
            className="btn-ghost"
            aria-label="Próximo mês"
          >
            ›
          </button>
          {mes !== mesAtual() && (
            <button onClick={() => setMes(mesAtual())} className="link-honey text-sm">
              voltar para o mês atual
            </button>
          )}
          <button
            onClick={() => {
              cache.current.delete(mes);
              setRevalidacao((n) => n + 1);
            }}
            disabled={carregando}
            className="btn-ghost ml-auto text-sm disabled:opacity-50"
            title="Buscar os numeros deste mês de novo"
          >
            {carregando ? "Atualizando..." : "Atualizar"}
          </button>
        </section>

        {dados && dados.contas.semEntidade > 0 && (
          <Link
            href="/contas"
            className="block rounded-xl border border-honey/35 bg-honey/10 px-4 py-3 text-sm font-medium text-honey-deep"
          >
            {dados.contas.semEntidade} conta(s) sem divisão ficam fora do resumo por pessoa.
          </Link>
        )}

        {primeiraCarga ? (
          <>
            <SkeletonCards n={4} />
            <SkeletonTabela linhas={6} />
            <SkeletonTabela linhas={4} />
          </>
        ) : (
          <Recarregando ativo={carregando}>
            <div className="space-y-8">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Receitas do mês" value={casal?.receitas ?? 0} detail="Salário + VA + VR + outras entradas" />
                <MetricCard label="Dívidas do mês" value={casal?.dividas ?? 0} detail="Parcelas + contas fixas em aberto" tone="bad" />
                <MetricCard label="Investido no mês" value={casal?.investido ?? 0} detail="Entradas em conta de investimento" />
                <MetricCard
                  label="Sobra"
                  value={casal?.sobra ?? 0}
                  detail="Renda − saídas − contas − aportes"
                  tone={(casal?.sobra ?? 0) >= 0 ? "good" : "bad"}
                />
              </section>

              <GraficoEvolucao dados={dados?.evolucao ?? []} />

              <section className="space-y-4">
                <h2 className="eyebrow">Resumo do mês - cada um e o casal</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-pine/[0.04] text-left text-sage">
                      <tr>
                        <th className="px-4 py-2 font-medium">Item</th>
                        {pessoas.map((p) => (
                          <th key={p.key} className="px-4 py-2 text-right font-medium">{p.nome}</th>
                        ))}
                        <th className="px-4 py-2 text-right font-semibold text-ink">Casal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LINHAS.map((linha) => (
                        <tr
                          key={linha.campo}
                          className={`border-t border-pine/8 ${linha.destaque ? "font-semibold" : ""}`}
                        >
                          <td className="px-4 py-2">
                            {linha.rotulo}
                            {linha.dica && <span className="block text-xs font-normal text-sage">{linha.dica}</span>}
                          </td>
                          {pessoas.map((p) => (
                            <td key={p.key} className="px-4 py-2 text-right tabular-nums">
                              {currency.format(p[linha.campo] as number)}
                            </td>
                          ))}
                          <td
                            className={`px-4 py-2 text-right font-semibold tabular-nums ${
                              linha.destaque
                                ? (casal?.sobra ?? 0) >= 0 ? "text-pine-600" : "text-clay"
                                : ""
                            }`}
                          >
                            {currency.format((casal?.[linha.campo] as number) ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pessoas.length === 0 && (
                  <p className="text-sm text-sage">
                    Defina o dono em <Link href="/entidades" className="link-honey">De quem é o dinheiro</Link> para
                    separar por pessoa.
                  </p>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="eyebrow">Metas</h2>
                  <Link href="/metas" className="link-honey text-sm">Gerenciar</Link>
                </div>
                <div className="card divide-y divide-pine/8">
                  {(dados?.metas ?? []).map((m) => (
                    <div key={m.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
                      <div>
                        <p className="font-medium text-ink">{m.nome}</p>
                        <p className="text-xs text-sage">
                          {currency.format(m.guardado)} de {currency.format(m.alvo)}
                          {m.targetDate ? ` | até ${formatDateBR(m.targetDate)}` : ""}
                        </p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pine/10">
                          <div className="h-full bg-honey" style={{ width: `${m.percent}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Falta</p>
                        <p className="font-medium tabular-nums">{currency.format(m.restante)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Aporte no mês</p>
                        <p className="font-medium tabular-nums">{currency.format(m.aporteDoMes)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Planejado/mês</p>
                        <p className="font-medium tabular-nums">{currency.format(m.planejadoMes)}</p>
                      </div>
                    </div>
                  ))}
                  {(dados?.metas ?? []).length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-sage">Nenhuma meta cadastrada.</p>
                  )}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="eyebrow">Maiores gastos do mês</h2>
                  <div className="card divide-y divide-pine/8">
                    {(dados?.categorias ?? []).map((c) => (
                      <div key={c.id ?? c.nome} className="flex items-center gap-3 px-5 py-3">
                        <span className="text-base">{c.icone ?? "*"}</span>
                        <span className="flex-1 truncate text-sm text-ink">{c.nome}</span>
                        <span className="text-sm font-medium tabular-nums text-ink">{currency.format(c.total)}</span>
                      </div>
                    ))}
                    {(dados?.categorias ?? []).length === 0 && (
                      <p className="px-5 py-8 text-center text-sm text-sage">Sem gastos neste mês.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="eyebrow">Contas fixas em aberto</h2>
                  <div className="card divide-y divide-pine/8">
                    {(dados?.bills ?? []).map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex-1 truncate text-sm text-ink">{b.name}</span>
                        <span className="text-xs text-sage">dia {b.dueDay}</span>
                        <span className="text-sm font-medium tabular-nums text-ink">{currency.format(b.amount)}</span>
                      </div>
                    ))}
                    {(dados?.bills ?? []).length === 0 && (
                      <p className="px-5 py-8 text-center text-sm text-sage">Nada em aberto.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <MetricCard label="Patrimônio total" value={dados?.contas.patrimonio ?? 0} detail="Saldo atual das contas" />
                <MetricCard label="Investimentos" value={dados?.contas.investimentos ?? 0} detail="Saldo em contas de investimento" />
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="eyebrow">Últimos lançamentos</h2>
                  <Link href="/transacoes" className="link-honey text-sm">Ver todos</Link>
                </div>
                <div className="card divide-y divide-pine/8">
                  {(dados?.ultimosLancamentos ?? []).map((t: any) => (
                    <div key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine/6 text-base">
                        {t.category?.icon ?? "*"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                        <p className="truncate text-xs text-sage">
                          {formatDateBR(t.date)}
                          {t.account?.entity?.name ? ` | ${t.account.entity.name}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${t.amount < 0 ? "text-clay" : "text-pine-600"}`}>
                        {currency.format(t.amount)}
                      </span>
                    </div>
                  ))}
                  {(dados?.ultimosLancamentos ?? []).length === 0 && (
                    <p className="px-5 py-10 text-center text-sm text-sage">Nenhum lançamento ainda.</p>
                  )}
                </div>
              </section>
            </div>
          </Recarregando>
        )}
      </main>
    </div>
  );
}
