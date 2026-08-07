"use client";

// Evolucao mes a mes: receitas x despesas.
//
// Duas series, mesma unidade (R$) e UM eixo y - nunca dois. Duas escalas no
// mesmo plano inventam uma correlacao que nao existe nos dados.
//
// As cores passaram no validador de paleta contra a superficie #FBF8F1, mas a
// separacao para deuteranopia fica em dE 6.3 (faixa-piso 6-8). Isso torna o
// rotulo direto no fim de cada linha OBRIGATORIO, nao decorativo: e' o encoding
// secundario que faz a serie ser identificavel sem depender da cor.

import { useEffect, useMemo, useRef, useState } from "react";
import { currency, rotuloMesCurto } from "@/lib/formato";
import Money from "@/components/Money";

export type PontoEvolucao = {
  month: string;
  receitas: number;
  despesas: number;
  liquido: number;
};

const SERIES = [
  { chave: "receitas" as const, nome: "Receitas", cor: "#0F8A5F" },
  { chave: "despesas" as const, nome: "Despesas", cor: "#B04A2F" },
];

const ALTURA = 240;
const PAD = { topo: 16, direita: 96, baixo: 28, esquerda: 56 };

// 2500 -> "2,5 mil"; 1200000 -> "1,2 mi". Rotulo de eixo precisa ser curto.
function valorCurto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export default function GraficoEvolucao({ dados }: { dados: PontoEvolucao[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  // Serie nova = seleção antiga nao vale mais (ela e' um indice do array velho).
  useEffect(() => {
    setAtivo(null);
  }, [dados]);

  // Mede o container em px de verdade, em vez de escalar um viewBox fixo - assim
  // a espessura das linhas e o tamanho do texto nao mudam com a largura da tela.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setLargura(Math.max(320, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const w = largura;
    const plotW = Math.max(1, w - PAD.esquerda - PAD.direita);
    const plotH = ALTURA - PAD.topo - PAD.baixo;
    const maximo = Math.max(1, ...dados.flatMap((d) => [d.receitas, d.despesas]));
    // Teto "redondo" para os ticks nao sairem quebrados.
    const passo = Math.pow(10, Math.floor(Math.log10(maximo))) / 2;
    const teto = Math.ceil(maximo / passo) * passo;

    const x = (i: number) =>
      PAD.esquerda + (dados.length <= 1 ? plotW / 2 : (i * plotW) / (dados.length - 1));
    const y = (v: number) => PAD.topo + plotH - (v / teto) * plotH;

    const linha = (chave: "receitas" | "despesas") =>
      dados.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[chave]).toFixed(1)}`).join(" ");

    return { w, plotW, plotH, teto, x, y, linha, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }, [dados, largura]);

  if (dados.length === 0) {
    return (
      <p className="card px-5 py-10 text-center text-sm text-sage">
        Sem lançamentos para montar a evolução.
      </p>
    );
  }

  const ultimo = dados.length - 1;
  // `ativo` guarda um INDICE, e a serie troca quando o usuario muda de mes. Sem
  // o clamp, sair de um mes com 12 pontos (indice 11 sob o mouse) para um mes
  // com 1 ponto deixava dados[11] === undefined e o acesso seguinte derrubava o
  // dashboard inteiro com TypeError.
  const foco = Math.min(ativo ?? ultimo, ultimo);
  const pontoFoco = dados[foco];

  // Rotulos diretos no fim das linhas; separa em 14px se as duas se encostarem.
  const yRec = g.y(dados[ultimo].receitas);
  const yDes = g.y(dados[ultimo].despesas);
  const colidem = Math.abs(yRec - yDes) < 14;
  const ajuste = colidem ? (yRec <= yDes ? -7 : 7) : 0;

  function indiceDoEvento(clientX: number) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rel = clientX - rect.left - PAD.esquerda;
    const passo = dados.length <= 1 ? g.plotW : g.plotW / (dados.length - 1);
    return Math.max(0, Math.min(dados.length - 1, Math.round(rel / passo)));
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">Evolução</h3>
        <p className="text-xs text-sage">
          {dados.length === 1
            ? "Primeiro mês com lançamento - o histórico aparece conforme os meses passam"
            : `Últimos ${dados.length} meses até o mês selecionado`}
        </p>
      </div>

      {/* Legenda sempre presente com 2 series: a identidade nunca depende so da cor. */}
      <ul className="mt-3 flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <li key={s.chave} className="flex items-center gap-2 text-xs text-ink/75">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.cor }} />
            {s.nome}
          </li>
        ))}
      </ul>

      {/* O SVG tem largura minima de 320px; em tela mais estreita que isso ele
          rola DENTRO do card, em vez de empurrar a pagina inteira. */}
      <div ref={boxRef} className="relative mt-2 w-full overflow-x-auto">
        <svg
          width={g.w}
          height={ALTURA}
          role="img"
          aria-label={`Evolução de receitas e despesas em ${dados.length} meses`}
          tabIndex={0}
          className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-honey"
          onPointerMove={(e) => setAtivo(indiceDoEvento(e.clientX))}
          onPointerLeave={() => setAtivo(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); setAtivo(Math.max(0, foco - 1)); }
            if (e.key === "ArrowRight") { e.preventDefault(); setAtivo(Math.min(dados.length - 1, foco + 1)); }
            if (e.key === "Escape") setAtivo(null);
          }}
        >
          {/* Grade: hairline solida, um tom acima da superficie. Nunca tracejada. */}
          {g.ticks.map((t) => {
            const yy = PAD.topo + g.plotH - t * g.plotH;
            return (
              <g key={t}>
                <line
                  x1={PAD.esquerda} x2={g.w - PAD.direita} y1={yy} y2={yy}
                  stroke="#1C3A31" strokeOpacity={t === 0 ? 0.18 : 0.07} strokeWidth={1}
                />
                <text
                  x={PAD.esquerda - 8} y={yy + 3} textAnchor="end"
                  className="fill-sage tabular-nums" fontSize={10}
                >
                  {valorCurto(g.teto * t)}
                </text>
              </g>
            );
          })}

          {/* Eixo x: no maximo 6 rotulos, para nao virar sopa de letras. */}
          {dados.map((d, i) => {
            const cada = Math.ceil(dados.length / 6);
            if (i % cada !== 0 && i !== ultimo) return null;
            return (
              <text
                key={d.month} x={g.x(i)} y={ALTURA - 10} textAnchor="middle"
                className="fill-sage" fontSize={10}
              >
                {rotuloMesCurto(d.month)}
              </text>
            );
          })}

          {/* Crosshair do ponto em foco */}
          {ativo !== null && (
            <line
              x1={g.x(foco)} x2={g.x(foco)} y1={PAD.topo} y2={PAD.topo + g.plotH}
              stroke="#22241F" strokeOpacity={0.25} strokeWidth={1}
            />
          )}

          {SERIES.map((s) => (
            <path
              key={s.chave} d={g.linha(s.chave)} fill="none" stroke={s.cor}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            />
          ))}

          {/* Marcador do ponto em foco: anel de 2px na cor da superficie. */}
          {SERIES.map((s) => (
            <circle
              key={s.chave} cx={g.x(foco)} cy={g.y(pontoFoco[s.chave])} r={4.5}
              fill={s.cor} stroke="#FBF8F1" strokeWidth={2}
            />
          ))}

          {/* Rotulo direto no fim de cada linha - encoding secundario obrigatorio.
              Ancora no ULTIMO ponto, nao na borda: com poucos meses a linha nao
              chega na direita e o rotulo ficaria solto longe do dado. */}
          {SERIES.map((s) => {
            const base = s.chave === "receitas" ? yRec + ajuste : yDes - ajuste;
            return (
              <text
                key={s.chave} x={Math.min(g.x(ultimo) + 10, g.w - PAD.direita + 10)} y={base + 3}
                fontSize={11} className="fill-ink" fontWeight={500}
              >
                {s.nome}
              </text>
            );
          })}
        </svg>

        {/* Tooltip: acrescenta leitura, nao e' o unico caminho - os mesmos numeros
            estao na tabela abaixo. */}
        {ativo !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-pine/12 bg-cream/95 px-3 py-2 text-xs shadow-card"
            style={{
              left: Math.min(Math.max(g.x(foco) - 70, 0), Math.max(0, g.w - 150)),
              width: 150,
            }}
          >
            <p className="font-medium text-ink">{rotuloMesCurto(pontoFoco.month)}</p>
            {SERIES.map((s) => (
              <p key={s.chave} className="mt-1 flex items-center justify-between gap-2 text-ink/75">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.cor }} />
                  {s.nome}
                </span>
                <span className="tabular-nums"><Money valor={pontoFoco[s.chave]} fluxo={s.chave === "despesas" ? "saida" : "entrada"} /></span>
              </p>
            ))}
            <p className="mt-1 flex items-center justify-between gap-2 border-t border-pine/10 pt-1 text-ink/75">
              <span>Líquido</span>
              <span className="tabular-nums"><Money valor={pontoFoco.liquido} fluxo="auto" /></span>
            </p>
          </div>
        )}
      </div>

      {/* Gemea em tabela: todo valor do grafico e' alcancavel sem depender de cor
          nem de hover. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-sage hover:text-ink">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[380px] text-xs">
            <thead className="text-left text-sage">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Mês</th>
                <th className="py-1.5 pr-3 text-right font-medium">Receitas</th>
                <th className="py-1.5 pr-3 text-right font-medium">Despesas</th>
                <th className="py-1.5 text-right font-medium">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.month} className="border-t border-pine/8">
                  <td className="py-1.5 pr-3">{rotuloMesCurto(d.month)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums"><Money valor={d.receitas} fluxo="entrada" /></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums"><Money valor={d.despesas} fluxo="saida" /></td>
                  <td className="py-1.5 text-right tabular-nums"><Money valor={d.liquido} fluxo="auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
