import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { contasAPagarDoMes, marcarPagamento, projecaoContasAPagar } from "@/lib/repo";
import { mesDeHojeSP } from "@/lib/rules";
import { pagamentoSchema } from "@/lib/schemas";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// Lista unificada do mes: conta fixa gerada, parcela, emprestimo e despesa
// avulsa - tudo junto, porque para quem paga sao todas "a mesma coisa".
export async function GET(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const p = new URL(req.url).searchParams;
    const mes = p.get("mes") ?? mesDeHojeSP();
    if (!MES.test(mes)) throw new ApiError("Mês inválido: use o formato AAAA-MM.");

    const [dados, projecao] = await Promise.all([
      contasAPagarDoMes(householdId, mes, {
        status: p.get("status"),
        categoriaId: p.get("categoria"),
        donoId: p.get("dono"),
      }),
      projecaoContasAPagar(householdId, mes, 12),
    ]);
    return { ...dados, projecao };
  });
}

// Marcar como pago / desmarcar.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const body = validate(pagamentoSchema, await readJson(req));
    return marcarPagamento(householdId, body.id, body.pago, body.data ?? null);
  });
}
