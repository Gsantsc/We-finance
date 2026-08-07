import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, validate, ApiError } from "@/lib/api";
import { editarLancamento, excluirLancamento } from "@/lib/repo";
import { editarLancamentoSchema } from "@/lib/schemas";

// Editar. Em parcela, `escopo` diz se a mudança vale só para esta ou para as
// futuras também.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const body = validate(editarLancamentoSchema, await readJson(req));
    return editarLancamento(householdId, body);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const p = new URL(req.url).searchParams;
    const id = p.get("id");
    if (!id) throw new ApiError("Informe o lançamento a excluir.");
    const escopo = p.get("escopo");
    return excluirLancamento(
      householdId,
      id,
      escopo === "esta_e_futuras" ? "esta_e_futuras" : "so_esta"
    );
  });
}
