"use client";

// Saidas por categoria do mes.
//
// BARRA HORIZONTAL, nao donut. Donut so responde "quanto do bolo" e obriga a
// comparar angulos; barra responde "quanto" e "qual e' maior" na mesma leitura,
// e o nome da categoria cabe ao lado sem virar legenda. Com mais de 5 fatias o
// donut ja fica ilegivel, e categoria de gasto passa disso facil.
//
// Clicar numa barra leva para os lancamentos daquele mes E daquela categoria -
// e' a pergunta seguinte de quem olha "Alimentacao: R$ 1.200".

import { useRouter } from "next/navigation";
import { formatarDinheiro } from "@/lib/dinheiro";
import Money from "@/components/Money";

export type GastoCategoria = {
  id: string | null;
  nome: string;
  icone: string | null;
  total: number;
};

// Uma cor so, em intensidade decrescente: a categoria nao tem ordem propria,
// entao cor categorica aqui gastaria o canal de cor com informacao que o
// tamanho da barra ja da. Sequencial mantem a leitura "maior = mais escuro".
const OPACIDADES = [1, 0.86, 0.72, 0.6, 0.5, 0.42, 0.36, 0.3, 0.26, 0.22, 0.2, 0.18];

export default function GastosPorCategoria({
  dados,
  mes,
}: {
  dados: GastoCategoria[];
  mes: string;
}) {
  const router = useRouter();

  if (dados.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="font-medium text-ink">Maiores gastos do mês</h3>
        <p className="my-8 text-center text-sm text-sage">Nenhuma saída lançada neste mês.</p>
      </div>
    );
  }

  const maior = Math.max(...dados.map((d) => d.total));
  const total = dados.reduce((s, d) => s + d.total, 0);

  function abrirLancamentos(c: GastoCategoria) {
    const q = new URLSearchParams({ mes });
    if (c.id) q.set("categoria", c.id);
    router.push(`/transacoes?${q}`);
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">Maiores gastos do mês</h3>
        <p className="text-xs text-sage">
          total <Money valor={total} fluxo="saida" />
        </p>
      </div>

      <ul className="mt-4 space-y-2.5">
        {dados.map((c, i) => {
          const pct = maior > 0 ? (c.total / maior) * 100 : 0;
          const fatia = total > 0 ? (c.total / total) * 100 : 0;
          return (
            <li key={c.id ?? c.nome}>
              <button
                onClick={() => abrirLancamentos(c)}
                className="group w-full text-left"
                title={`Ver lançamentos de ${c.nome} neste mês`}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink group-hover:underline">
                    {c.icone && <span className="mr-1.5">{c.icone}</span>}
                    {c.nome}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="text-xs text-sage tabular-nums">{fatia.toFixed(0)}%</span>
                    <Money valor={c.total} fluxo="saida" />
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-pine/8">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: "#B04A2F",
                      opacity: OPACIDADES[Math.min(i, OPACIDADES.length - 1)],
                    }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-sage">Clique numa categoria para ver os lançamentos dela.</p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-sage hover:text-ink">Ver como tabela</summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {dados.map((c) => (
              <tr key={c.id ?? c.nome} className="border-t border-pine/8">
                <td className="py-1.5">{c.nome}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatarDinheiro(c.total, "saida")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
