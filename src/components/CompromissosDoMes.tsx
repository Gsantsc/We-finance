"use client";

// O compromisso do mes separado em DUAS NATUREZAS.
//
// Somar tudo num "gastos do mes" esconde a pergunta que mais importa para quem
// esta endividado: quanto disto ACABA, e quando? Um aluguel de 2.200 e uma
// parcela de 715 pesam igual no mes, mas sao coisas opostas - o primeiro e'
// custo de vida permanente, o segundo tem data de saida.
//
// Por isso o lado "Parcelado" mostra tres coisas que o lado "Todo mes" nao tem:
// em que parcela esta, quando termina, e quanto ainda falta pagar no total.

import Money from "@/components/Money";
import { formatDateBR, rotuloMesCurto } from "@/lib/formato";

type ItemBase = {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  pago: boolean;
  categoria: string | null;
  icone: string | null;
  dono: string | null;
};

type ItemParcelado = ItemBase & {
  parcela: number | null;
  parcelaTotal: number | null;
  terminaEm: string | null;
  parcelasRestantes: number;
  faltaPagar: number;
};

export type Compromissos = {
  todoMes: { itens: ItemBase[]; total: number };
  parcelado: { itens: ItemParcelado[]; total: number };
};

export default function CompromissosDoMes({ dados }: { dados?: Compromissos }) {
  const fixo = dados?.todoMes;
  const parc = dados?.parcelado;
  const totalMes = (fixo?.total ?? 0) + (parc?.total ?? 0);
  // Quanto do compromisso mensal tem data para acabar.
  const pctParcelado = totalMes > 0 ? ((parc?.total ?? 0) / totalMes) * 100 : 0;
  const faltaPagarTudo = (parc?.itens ?? []).reduce((s, i) => s + i.faltaPagar, 0);
  // O mes em que o ultimo parcelamento se encerra.
  const ultimoFim = (parc?.itens ?? [])
    .map((i) => i.terminaEm)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="eyebrow">Com o que estamos comprometidos</h2>
        <p className="mt-1 text-sm text-sage">
          Separado por natureza: o que se repete <strong>para sempre</strong> e o que{" "}
          <strong>tem data para acabar</strong>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Todo mês"
          subtitulo="Contas fixas — não acabam sozinhas"
          total={fixo?.total ?? 0}
          vazio="Nenhuma conta fixa neste mês."
        >
          {(fixo?.itens ?? []).map((i) => (
            <Linha key={i.id} item={i} />
          ))}
        </Bloco>

        <Bloco
          titulo="Parcelado"
          subtitulo={
            ultimoFim
              ? `Tem fim — o último termina em ${rotuloMesCurto(ultimoFim)}`
              : "Parcelas e empréstimos"
          }
          total={parc?.total ?? 0}
          vazio="Nenhuma parcela neste mês."
        >
          {(parc?.itens ?? []).map((i) => (
            <Linha
              key={i.id}
              item={i}
              extra={
                <>
                  {i.parcela && i.parcelaTotal && (
                    <span className="chip bg-pine/8 text-xs text-pine/70">
                      {i.parcela}/{i.parcelaTotal}
                    </span>
                  )}
                  {i.terminaEm && (
                    <span className="text-xs text-sage">até {rotuloMesCurto(i.terminaEm)}</span>
                  )}
                </>
              }
              rodape={
                i.faltaPagar > 0 ? (
                  <span className="text-xs text-sage">
                    ainda faltam <Money valor={i.faltaPagar} fluxo="neutro" semCor /> em{" "}
                    {i.parcelasRestantes}{" "}
                    {i.parcelasRestantes === 1 ? "parcela" : "parcelas"}
                  </span>
                ) : null
              }
            />
          ))}
        </Bloco>
      </div>

      {totalMes > 0 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-ink">Compromisso do mês</span>
            <Money valor={totalMes} fluxo="saida" className="font-serif text-2xl" />
          </div>

          {/* Barra: quanto do compromisso mensal some com o tempo. */}
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-pine/8">
            <div
              className="h-full bg-clay/70"
              style={{ width: `${100 - pctParcelado}%` }}
              title="Todo mês"
            />
            <div
              className="h-full bg-honey"
              style={{ width: `${pctParcelado}%` }}
              title="Parcelado"
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-sage">
            <span>
              <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-clay/70" />
              {(100 - pctParcelado).toFixed(0)}% é fixo, continua depois
            </span>
            <span>
              <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-honey" />
              {pctParcelado.toFixed(0)}% é parcelado, vai acabar
            </span>
          </div>

          {faltaPagarTudo > 0 && (
            <p className="mt-3 border-t border-pine/8 pt-3 text-sm text-ink/75">
              Somando todas as parcelas que ainda vão vencer, faltam{" "}
              <strong><Money valor={faltaPagarTudo} fluxo="neutro" semCor /></strong>
              {ultimoFim && <> — o último parcelamento se encerra em {rotuloMesCurto(ultimoFim)}</>}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Bloco({
  titulo,
  subtitulo,
  total,
  vazio,
  children,
}: {
  titulo: string;
  subtitulo: string;
  total: number;
  vazio: string;
  children: React.ReactNode;
}) {
  const temItens = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card flex flex-col p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-medium text-ink">{titulo}</h3>
          <p className="text-xs text-sage">{subtitulo}</p>
        </div>
        <Money valor={total} fluxo="saida" className="font-serif text-xl" />
      </div>
      <div className="mt-3 flex-1 divide-y divide-pine/8">
        {temItens ? children : <p className="py-6 text-center text-sm text-sage">{vazio}</p>}
      </div>
    </div>
  );
}

function Linha({
  item,
  extra,
  rodape,
}: {
  item: ItemBase;
  extra?: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
          {item.icone && <span aria-hidden>{item.icone}</span>}
          <span className={`truncate text-sm ${item.pago ? "text-sage line-through" : "text-ink"}`}>
            {item.descricao}
          </span>
          {extra}
        </span>
        <Money valor={item.valor} fluxo="saida" semCor={item.pago} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-sage">
        <span>vence {formatDateBR(item.vencimento)}</span>
        {item.dono && <span>· {item.dono}</span>}
        {item.pago && <span className="text-pine">· pago</span>}
        {rodape && <span className="w-full">{rodape}</span>}
      </div>
    </div>
  );
}
