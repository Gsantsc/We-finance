// Unico lugar que pinta e assina dinheiro na tela.
//
// Ver src/lib/dinheiro.ts para a decisao de dominio: no banco o valor e' sempre
// positivo e o sentido vem do type. Aqui o `fluxo` diz o sentido, e o sinal e'
// aplicado a partir do MODULO do numero - passar 715 ou -715 com fluxo="saida"
// da o mesmo "−R$ 715,00". Dupla negacao nao acontece nem se quem chama errar.

import { corDoFluxo, formatarDinheiro, type Fluxo } from "@/lib/dinheiro";

export default function Money({
  valor,
  fluxo = "auto",
  className = "",
  semCor = false,
}: {
  valor: number;
  fluxo?: Fluxo;
  className?: string;
  /** Mantem o sinal mas herda a cor do texto ao redor (ex.: linha "Já pago"). */
  semCor?: boolean;
}) {
  const cor = semCor ? "" : corDoFluxo(valor, fluxo);
  return (
    <span className={`tabular-nums ${cor} ${className}`.trim()}>
      {formatarDinheiro(valor, fluxo)}
    </span>
  );
}
