"use client";

// Dashboard mes a mes.
//
// Um request por mes (/api/dashboard?mes=AAAA-MM) e NADA e' somado aqui: os
// numeros ja vem agregados pelas views. O dashboard antigo puxava ate 2000
// transacoes e recalculava tudo no cliente, o que ficava lento e podia divergir
// da tela de lancamentos. Mes ja visitado fica em cache, entao voltar e' instantaneo.

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import GraficoEvolucao, { type PontoEvolucao } from "@/components/GraficoEvolucao";
import GastosPorCategoria from "@/components/GastosPorCategoria";
import { Recarregando, SkeletonCards, SkeletonTabela } from "@/components/Skeleton";
import { getJson, mensagemDeErro } from "@/lib/http";
import { formatDateBR, nomesMeses, rotuloMesCurto } from "@/lib/formato";
import Money from "@/components/Money";
import type { Fluxo } from "@/lib/dinheiro";
import { addMonthKey, mesDeHojeSP } from "@/lib/rules";

type Coluna = {
  key: string;
  nome: string;
  isTotal: boolean;
  salario: number;
  va: number;
  vr: number;
  outrasEntradas: number;
  parcelas: number;
  contasFixas: number;
  outrosGastos: number;
  dividas: number;
  investido: number;
  aportes: number;
  entrou: number;
  saiu: number;
  guardado: number;
  receitas: number;
  despesas: number;
  sobra: number;
};

type ItemPatrimonio = { rotulo: string; valor: number; detalhe: string | null };

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
  contas: { saldoEmContas: number; investimentos: number; total: number; semEntidade: number };
  patrimonio: {
    ativos: number;
    passivos: number;
    liquido: number;
    itensAtivos: ItemPatrimonio[];
    itensPassivos: ItemPatrimonio[];
  };
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

// A tabela antiga misturava pedacos da receita com coisas de outra natureza e
// nada somava com nada - nao dava para conferir. Agora sao tres blocos que se
// somam, cada um com seu subtotal, e a sobra sai da conta dos tres.
type Linha = { rotulo: string; campo: keyof Coluna; dica: string };
type Bloco = {
  titulo: string;
  linhas: Linha[];
  totalCampo: keyof Coluna;
  totalRotulo: string;
  fluxo: Fluxo;
  /** Guardado subtrai da sobra, entao leva sinal - mas nao e' perda, e por isso
   *  nao leva vermelho. Pintar poupanca de vermelho seria mentir sobre ela. */
  semCor?: boolean;
};

const BLOCOS: Bloco[] = [
  {
    titulo: "Entrou",
    totalCampo: "entrou",
    totalRotulo: "Total que entrou",
    fluxo: "entrada",
    linhas: [
      { rotulo: "Salário", campo: "salario", dica: "Lançamentos de entrada com a categoria Salário" },
      { rotulo: "VA", campo: "va", dica: "Entradas numa conta do tipo Vale alimentação" },
      { rotulo: "VR", campo: "vr", dica: "Entradas numa conta do tipo Vale refeição" },
      { rotulo: "Investimentos", campo: "investido", dica: "Entradas numa conta do tipo Investimento" },
      { rotulo: "Outras entradas", campo: "outrasEntradas", dica: "Todo o resto que entrou no mês" },
    ],
  },
  {
    titulo: "Saiu",
    totalCampo: "saiu",
    totalRotulo: "Total que saiu",
    fluxo: "saida",
    linhas: [
      { rotulo: "Parcelas", campo: "parcelas", dica: "As parcelas que caem neste mês" },
      { rotulo: "Contas fixas", campo: "contasFixas", dica: "As recorrentes ainda não marcadas como pagas" },
      { rotulo: "Outros gastos", campo: "outrosGastos", dica: "Despesas avulsas lançadas no mês" },
    ],
  },
  {
    titulo: "Guardado",
    totalCampo: "guardado",
    totalRotulo: "Total guardado",
    fluxo: "saida",
    semCor: true,
    linhas: [
      { rotulo: "Aportes em metas", campo: "aportes", dica: "O que você separou para as metas neste mês" },
    ],
  },
];

// Patrimonio LIQUIDO = ativos − passivos. O card abre porque um numero so nao
// da para conferir: quem ve "R$ 12.000" precisa poder perguntar "de onde?" sem
// sair da tela. Cada item que compoe os dois lados aparece aqui.
function CardPatrimonio({ patrimonio }: { patrimonio?: Dados["patrimonio"] }) {
  const [aberto, setAberto] = useState(false);
  const p = patrimonio;

  return (
    <div className="card p-5">
      <p className="eyebrow">Patrimônio líquido</p>
      <p className="mt-2 font-serif text-3xl">
        <Money valor={p?.liquido ?? 0} fluxo="auto" />
      </p>
      <p className="mt-1 text-xs text-sage">
        <Money valor={p?.ativos ?? 0} fluxo="neutro" semCor /> em ativos −{" "}
        <Money valor={p?.passivos ?? 0} fluxo="neutro" semCor /> em dívidas
      </p>

      {p && (p.itensAtivos.length > 0 || p.itensPassivos.length > 0) && (
        <>
          <button
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="link-honey mt-3 text-xs"
          >
            {aberto ? "Esconder a conta" : "Ver de onde vem"}
          </button>

          {aberto && (
            <div className="mt-3 space-y-3 border-t border-pine/10 pt-3 text-sm">
              <Lado titulo="Ativos" itens={p.itensAtivos} total={p.ativos} fluxo="entrada" />
              <Lado titulo="Dívidas" itens={p.itensPassivos} total={p.passivos} fluxo="saida" />
              <div className="flex items-baseline justify-between border-t border-pine/15 pt-2 font-semibold">
                <span>Líquido</span>
                <Money valor={p.liquido} fluxo="auto" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Lado({
  titulo,
  itens,
  total,
  fluxo,
}: {
  titulo: string;
  itens: ItemPatrimonio[];
  total: number;
  fluxo: Fluxo;
}) {
  if (itens.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sage">{titulo}</p>
        <p className="mt-1 text-xs text-sage">Nada aqui.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-sage">{titulo}</p>
      <ul className="mt-1 space-y-1">
        {itens.map((i, idx) => (
          <li key={`${i.rotulo}-${idx}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate">
              {i.rotulo}
              {i.detalhe && <span className="ml-1.5 text-xs text-sage">{i.detalhe}</span>}
            </span>
            <Money valor={i.valor} fluxo={fluxo} />
          </li>
        ))}
      </ul>
      <p className="mt-1 flex items-baseline justify-between border-t border-pine/8 pt-1 font-medium">
        <span>Total</span>
        <Money valor={total} fluxo={fluxo} />
      </p>
    </div>
  );
}

function MetricCard(props: { label: string; value: number; detail?: string; fluxo?: Fluxo }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{props.label}</p>
      <p className="mt-2 font-serif text-3xl">
        <Money valor={props.value} fluxo={props.fluxo ?? "auto"} />
      </p>
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

        {/* O caso que mais confunde: a pessoa cadastra a conta com o salario no
            campo de saldo e espera ver o resumo preenchido. Saldo e' uma FOTO
            (quanto tem hoje); o resumo e' o FILME (o que entrou e saiu no mes).
            Sem este aviso a tela mostra R$ 0,00 e nao explica por que. */}
        {dados && !primeiraCarga && casal?.entrou === 0 && dados.contas.saldoEmContas > 0 && (
          <div className="rounded-xl border border-honey/35 bg-honey/10 px-4 py-4">
            <p className="text-sm font-medium text-honey-deep">
              Nenhuma entrada lançada em {tituloMes(mes).toLowerCase()}.
            </p>
            <p className="mt-1.5 text-sm text-ink/75">
              Você tem <strong><Money valor={dados.contas.saldoEmContas} fluxo="neutro" semCor /></strong> somando os saldos
              das contas, mas saldo é quanto existe <em>hoje</em> — o resumo do mês mostra o que
              entrou e saiu <em>neste mês</em>. Para o salário aparecer aqui, lance-o como entrada.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/novo" className="btn-primary text-sm">Lançar meu salário</Link>
              <Link href="/importar" className="btn-ghost text-sm">Ou importar o extrato</Link>
            </div>
          </div>
        )}

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
                <MetricCard label="Receitas do mês" value={casal?.receitas ?? 0} detail="Salário + VA + VR + outras entradas" fluxo="entrada" />
                <MetricCard label="Dívidas do mês" value={casal?.dividas ?? 0} detail="Parcelas + contas fixas em aberto" fluxo="saida" />
                <MetricCard label="Investido no mês" value={casal?.investido ?? 0} detail="Entradas em conta de investimento" fluxo="neutro" />
                <MetricCard
                  label="Sobra"
                  value={casal?.sobra ?? 0}
                  detail="Renda − saídas − contas − aportes"
                  fluxo="auto"
                />
              </section>

              <GraficoEvolucao dados={dados?.evolucao ?? []} />

              <section className="space-y-4">
                <div>
                  <h2 className="eyebrow">Resumo do mês</h2>
                  <p className="mt-1 text-sm text-sage">
                    Só conta o que foi <strong>lançado</strong> neste mês. Saldo parado em conta não
                    aparece aqui — ele está em Patrimônio, mais abaixo.
                  </p>
                </div>

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
                      {BLOCOS.map((bloco) => (
                        <Fragment key={bloco.titulo}>
                          <tr className="border-t border-pine/12 bg-pine/[0.03]">
                            <td colSpan={pessoas.length + 2} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-sage">
                              {bloco.titulo}
                            </td>
                          </tr>
                          {bloco.linhas.map((linha) => (
                            <tr key={linha.campo} className="border-t border-pine/8">
                              <td className="px-4 py-2 pl-6">
                                {linha.rotulo}
                                <span className="block text-xs text-sage">{linha.dica}</span>
                              </td>
                              {pessoas.map((p) => (
                                <td key={p.key} className="px-4 py-2 text-right tabular-nums">
                                  <Money valor={p[linha.campo] as number} fluxo={bloco.fluxo} semCor={bloco.semCor} />
                                </td>
                              ))}
                              <td className="px-4 py-2 text-right tabular-nums">
                                <Money valor={(casal?.[linha.campo] as number) ?? 0} fluxo={bloco.fluxo} semCor={bloco.semCor} />
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t border-pine/8 font-medium">
                            <td className="px-4 py-2 pl-6">{bloco.totalRotulo}</td>
                            {pessoas.map((p) => (
                              <td key={p.key} className="px-4 py-2 text-right tabular-nums">
                                <Money valor={p[bloco.totalCampo] as number} fluxo={bloco.fluxo} semCor={bloco.semCor} />
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right font-semibold tabular-nums">
                              <Money valor={(casal?.[bloco.totalCampo] as number) ?? 0} fluxo={bloco.fluxo} semCor={bloco.semCor} />
                            </td>
                          </tr>
                        </Fragment>
                      ))}

                      <tr className="border-t-2 border-pine/20 bg-pine/[0.04] font-semibold">
                        <td className="px-4 py-3">
                          Sobra
                          <span className="block text-xs font-normal text-sage">
                            Entrou − saiu − guardado
                          </span>
                        </td>
                        {pessoas.map((p) => (
                          <td key={p.key} className="px-4 py-3 text-right tabular-nums">
                            <Money valor={p.sobra} fluxo="auto" />
                          </td>
                        ))}
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            (casal?.sobra ?? 0) >= 0 ? "text-pine-600" : "text-clay"
                          }`}
                        >
                          <Money valor={casal?.sobra ?? 0} fluxo="auto" />
                        </td>
                      </tr>
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
                          <Money valor={m.guardado} fluxo="neutro" semCor /> de <Money valor={m.alvo} fluxo="neutro" semCor />
                          {m.targetDate ? ` | até ${formatDateBR(m.targetDate)}` : ""}
                        </p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pine/10">
                          <div className="h-full bg-honey" style={{ width: `${m.percent}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Falta</p>
                        <p className="font-medium tabular-nums"><Money valor={m.restante} fluxo="neutro" semCor /></p>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Aporte no mês</p>
                        <p className="font-medium tabular-nums"><Money valor={m.aporteDoMes} fluxo="neutro" semCor /></p>
                      </div>
                      <div>
                        <p className="text-xs text-sage">Planejado/mês</p>
                        <p className="font-medium tabular-nums"><Money valor={m.planejadoMes} fluxo="neutro" semCor /></p>
                      </div>
                    </div>
                  ))}
                  {(dados?.metas ?? []).length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-sage">Nenhuma meta cadastrada.</p>
                  )}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <GastosPorCategoria dados={dados?.categorias ?? []} mes={mes} />

                <div className="space-y-3">
                  <h2 className="eyebrow">Contas fixas em aberto</h2>
                  <div className="card divide-y divide-pine/8">
                    {(dados?.bills ?? []).map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex-1 truncate text-sm text-ink">{b.name}</span>
                        <span className="text-xs text-sage">dia {b.dueDay}</span>
                        <span className="text-sm font-medium tabular-nums text-ink"><Money valor={b.amount} fluxo="saida" /></span>
                      </div>
                    ))}
                    {(dados?.bills ?? []).length === 0 && (
                      <p className="px-5 py-8 text-center text-sm text-sage">Nada em aberto.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <CardPatrimonio patrimonio={dados?.patrimonio} />
                <MetricCard label="Investimentos" value={dados?.contas.investimentos ?? 0} detail="Saldo em contas de investimento" fluxo="neutro" />
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
                        <Money valor={t.amount} fluxo="auto" />
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
