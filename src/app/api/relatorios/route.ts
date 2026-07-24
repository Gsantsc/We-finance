import { NextRequest } from "next/server";
import { handle, requireSession } from "@/lib/api";
import { monthlySummary, spendingByCategory } from "@/lib/repo";

// Junta os dados dos graficos num request so: evolucao mensal (receita x despesa)
// e a composicao das despesas do mes atual por categoria.
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const entityId = searchParams.get("entityId");
    const meses = Number(searchParams.get("meses")) || 6;

    const agora = new Date();
    const [mensal, porCategoria] = await Promise.all([
      monthlySummary(meses, entityId),
      spendingByCategory(agora.getMonth() + 1, agora.getFullYear(), entityId),
    ]);
    return { mensal, porCategoria };
  });
}
