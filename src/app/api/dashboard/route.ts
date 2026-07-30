import { NextRequest } from "next/server";
import { handle, requireHousehold, ApiError } from "@/lib/api";
import { dashboardMonth } from "@/lib/repo";
import { mesDeHojeSP } from "@/lib/rules";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// Tudo do mes num request so, ja agregado pelas views. O cliente nao soma nada.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const pedido = new URL(req.url).searchParams.get("mes");
    const mes = pedido ?? mesDeHojeSP();
    if (!MES.test(mes)) throw new ApiError("Mês inválido: use o formato AAAA-MM.");
    return dashboardMonth(householdId, mes);
  });
}
