"use client";

// Evolucao mes a mes: entradas, saidas e saldo.
//
// UM eixo y, nunca dois. As tres series estao em reais, entao dividem a mesma
// escala; duas escalas no mesmo plano inventam uma correlacao que nao existe.
//
// PROJECAO: os meses futuros vem TRACEJADOS e so contem COMPROMISSO ASSUMIDO
// (parcelas ja lancadas + contas fixas recorrentes). Nao ha chute de receita -
// projetar salario exigiria supor que ele se repete, e uma linha inventada num
// grafico de dinheiro e' pior que uma linha ausente. Por isso a projecao aparece
// so em Saidas; Entradas e Saldo param no mes atual.
//
// As cores passaram no validador contra a superficie #FBF8F1, mas a separacao
// entre entradas e saidas em deuteranopia fica na faixa-piso (dE 6.3). Por isso
// a legenda com o nome escrito nao e' enfeite: e' o encoding que nao depende de
// cor. A tabela no fim garante o mesmo sem hover.

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarDinheiro } from "@/lib/dinheiro";
import { rotuloMesCurto } from "@/lib/formato";

export type PontoEvolucao = {
  month: string;
  receitas: number;
  despesas: number;
  liquido: number;
  projetado?: boolean;
};

const SERIES = [
  { chave: "receitas", nome: "Entradas", cor: "#0F8A5F" },
  { chave: "despesas", nome: "Saídas", cor: "#B04A2F" },
  { chave: "liquido", nome: "Saldo", cor: "#C6892B" },
] as const;

type ChaveSerie = (typeof SERIES)[number]["chave"];

const JANELAS = [3, 6, 12] as const;

function valorCurto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mi`;
  if (abs >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return String(Math.round(v));
}

function fluxoDa(chave: ChaveSerie) {
  return chave === "despesas" ? "saida" : chave === "receitas" ? "entrada" : "auto";
}

export default function GraficoEvolucao({ dados }: { dados: PontoEvolucao[] }) {
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(12);
  const [ocultas, setOcultas] = useState<Set<ChaveSerie>>(new Set());

  const { serie, primeiroProjetado, totalReais } = useMemo(() => {
    const reais = dados.filter((d) => !d.projetado);
    const projetados = dados.filter((d) => d.projetado);
    // A janela conta os meses REAIS; a projecao vem inteira, senao trocar para
    // "3m" esconderia justamente as parcelas que a pessoa quer ver chegando.
    const recorte = [...reais.slice(-janela), ...projetados];
    const ultimoReal = recorte.filter((d) => !d.projetado).at(-1);

    const serie = recorte.map((d) => ({
      ...d,
      rotulo: rotuloMesCurto(d.month),
      // Duas colunas para a mesma serie: solida no passado, tracejada no futuro.
      // O ultimo ponto real entra nas duas, senao fica um buraco na emenda.
      despesasReal: d.projetado ? null : d.despesas,
      despesasProj: d.projetado || d.month === ultimoReal?.month ? d.despesas : null,
      receitasReal: d.projetado ? null : d.receitas,
      liquidoReal: d.projetado ? null : d.liquido,
    }));

    return { serie, primeiroProjetado: projetados[0]?.month ?? null, totalReais: reais.length };
  }, [dados, janela]);

  function alternar(chave: ChaveSerie) {
    setOcultas((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  if (totalReais < 2) {
    return (
      <div className="card p-5">
        <h3 className="font-medium text-ink">Evolução</h3>
        <p className="my-8 text-center text-sm text-sage">
          Sem dados suficientes — lance pelo menos 2 meses para a linha do tempo fazer sentido.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-medium text-ink">Evolução</h3>
        <div className="flex items-center gap-0.5 rounded-lg bg-pine/5 p-0.5">
          {JANELAS.map((j) => (
            <button
              key={j}
              onClick={() => setJanela(j)}
              aria-pressed={janela === j}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                janela === j ? "bg-pine text-cream" : "text-pine/60 hover:text-pine"
              }`}
            >
              {j}m
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {SERIES.map((s) => {
          const oculta = ocultas.has(s.chave);
          return (
            <li key={s.chave}>
              <button
                onClick={() => alternar(s.chave)}
                aria-pressed={!oculta}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-pine/5 ${
                  oculta ? "opacity-40" : ""
                }`}
              >
                <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.cor }} />
                <span className={oculta ? "text-sage line-through" : "text-ink/75"}>{s.nome}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#1C3A31" strokeOpacity={0.07} vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 11, fill: "#8A9B8E" }}
              tickLine={false}
              axisLine={{ stroke: "#1C3A31", strokeOpacity: 0.18 }}
              minTickGap={10}
            />
            <YAxis
              tickFormatter={valorCurto}
              tick={{ fontSize: 11, fill: "#8A9B8E" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "#22241F", strokeOpacity: 0.2 }}
              content={<TooltipRico serie={serie} ocultas={ocultas} />}
            />

            {primeiroProjetado && (
              <ReferenceLine
                x={rotuloMesCurto(primeiroProjetado)}
                stroke="#1C3A31"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
                label={{ value: "previsto", position: "insideTopRight", fontSize: 10, fill: "#8A9B8E" }}
              />
            )}

            {!ocultas.has("receitas") && (
              <Line
                type="monotone" dataKey="receitasReal" name="Entradas"
                stroke="#0F8A5F" strokeWidth={2} dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#FBF8F1" }}
                connectNulls={false} isAnimationActive={false}
              />
            )}
            {!ocultas.has("despesas") && (
              <>
                <Line
                  type="monotone" dataKey="despesasReal" name="Saídas"
                  stroke="#B04A2F" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#FBF8F1" }}
                  connectNulls={false} isAnimationActive={false}
                />
                <Line
                  type="monotone" dataKey="despesasProj" name="Saídas previstas"
                  stroke="#B04A2F" strokeWidth={2} strokeDasharray="5 4" dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#FBF8F1" }}
                  connectNulls={false} isAnimationActive={false}
                />
              </>
            )}
            {!ocultas.has("liquido") && (
              <Line
                type="monotone" dataKey="liquidoReal" name="Saldo"
                stroke="#C6892B" strokeWidth={2} dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#FBF8F1" }}
                connectNulls={false} isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-sage hover:text-ink">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs">
            <thead className="text-left text-sage">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Mês</th>
                <th className="py-1.5 pr-3 text-right font-medium">Entradas</th>
                <th className="py-1.5 pr-3 text-right font-medium">Saídas</th>
                <th className="py-1.5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((d) => (
                <tr key={d.month} className="border-t border-pine/8">
                  <td className="py-1.5 pr-3">
                    {d.rotulo}
                    {d.projetado && <span className="ml-1 text-sage">(previsto)</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {d.projetado ? "—" : formatarDinheiro(d.receitas, "entrada")}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatarDinheiro(d.despesas, "saida")}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {d.projetado ? "—" : formatarDinheiro(d.liquido, "auto")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// A pergunta que se faz olhando um grafico de dinheiro nao e' "quanto?", e'
// "mudou quanto?". Por isso a variacao contra o mes anterior vem junto.
function TooltipRico({
  active,
  label,
  serie,
  ocultas,
}: {
  active?: boolean;
  label?: string;
  serie: (PontoEvolucao & { rotulo: string })[];
  ocultas: Set<ChaveSerie>;
}) {
  if (!active || !label) return null;
  const i = serie.findIndex((d) => d.rotulo === label);
  if (i < 0) return null;
  const ponto = serie[i];
  const anterior = i > 0 ? serie[i - 1] : null;

  return (
    <div className="rounded-lg border border-pine/12 bg-cream/95 px-3 py-2 text-xs shadow-card">
      <p className="font-medium text-ink">
        {ponto.rotulo}
        {ponto.projetado && <span className="ml-1 font-normal text-sage">previsto</span>}
      </p>
      {SERIES.filter((s) => !ocultas.has(s.chave)).map((s) => {
        // No mes projetado nao ha receita nem saldo. Mostrar "R$ 0,00" ali
        // afirmaria que nada vai entrar; o que existe e' ausencia de previsao.
        if (ponto.projetado && s.chave !== "despesas") return null;
        const valor = ponto[s.chave];
        const antes = anterior && !anterior.projetado ? anterior[s.chave] : null;
        const variacao = antes && antes !== 0 ? ((valor - antes) / Math.abs(antes)) * 100 : null;
        return (
          <p key={s.chave} className="mt-1 flex items-center justify-between gap-3 text-ink/75">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.cor }} />
              {s.nome}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums">{formatarDinheiro(valor, fluxoDa(s.chave))}</span>
              {variacao !== null && Math.abs(variacao) >= 0.5 && (
                <span className={`tabular-nums ${variacao > 0 ? "text-clay" : "text-pine-600"}`}>
                  {variacao > 0 ? "▲" : "▼"}
                  {Math.abs(variacao).toFixed(0)}%
                </span>
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
}
