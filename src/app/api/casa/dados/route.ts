import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/api";
import { corpoDeErro } from "@/lib/errors";
import { exportarDadosDaCasa, excluirCasaEDados } from "@/lib/repo";

// GET  -> baixa TUDO da casa em JSON (LGPD art. 18, V - portabilidade)
// DELETE -> apaga a casa e os dados (LGPD art. 18, VI - eliminacao)
//
// Nao usa handle() porque a resposta do GET nao e' JSON de API e sim um arquivo
// para download, com Content-Disposition.
export async function GET() {
  try {
    const { householdId } = await requireHousehold();
    const dados = await exportarDadosDaCasa(householdId);
    const nome = `we-finance-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(dados, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
        // Export tem dado financeiro: nao pode ficar em cache de proxy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (err) {
    const { body, status } = corpoDeErro(err);
    if (status >= 500) console.error("[exportar] erro nao tratado:", err);
    return NextResponse.json(body, { status });
  }
}

// Exclusao definitiva. Exige confirmacao explicita no corpo para nao acontecer
// por um DELETE disparado sem querer.
export async function DELETE(req: NextRequest) {
  try {
    const { householdId } = await requireHousehold();
    const confirmacao = new URL(req.url).searchParams.get("confirmacao");
    if (confirmacao !== "APAGAR") {
      return NextResponse.json(
        { code: "VALIDACAO", message: "Confirmação ausente." },
        { status: 400 }
      );
    }
    const removido = await excluirCasaEDados(householdId);
    return NextResponse.json({ ok: true, removido });
  } catch (err) {
    const { body, status } = corpoDeErro(err);
    if (status >= 500) console.error("[excluir-casa] erro nao tratado:", err);
    return NextResponse.json(body, { status });
  }
}
