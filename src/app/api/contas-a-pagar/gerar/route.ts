import { NextRequest } from "next/server";
import { handle, requireHousehold, ApiError } from "@/lib/api";
import { gerarContasFixasDoMes } from "@/lib/repo";
import { addMonthKey, mesDeHojeSP } from "@/lib/rules";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// Materializa as contas fixas de um mes como lancamento.
//
// Fica num POST, e nao dentro do GET da lista, porque isto CRIA dado: ler uma
// tela nao pode ter efeito colateral. A tela chama esta rota antes de listar.
//
// Idempotente pelo indice unico (bill_id, mes): chamar de novo devolve 0 criadas
// em vez de duplicar. Por isso da para chamar a cada abertura sem cuidado extra.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const mes = new URL(req.url).searchParams.get("mes") ?? mesDeHojeSP();
    if (!MES.test(mes)) throw new ApiError("Mês inválido: use o formato AAAA-MM.");

    // Gera o mes pedido e o seguinte: assim o "próximo mês" ja abre pronto, e
    // quem cadastra uma conta fixa hoje ve o efeito dela sem precisar navegar.
    const [atual, proximo] = await Promise.all([
      gerarContasFixasDoMes(householdId, mes),
      gerarContasFixasDoMes(householdId, addMonthKey(mes, 1)),
    ]);
    return { criadas: atual + proximo, mes };
  });
}
