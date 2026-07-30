import { NextRequest } from "next/server";
import { handle, readJson, requireHousehold, ApiError } from "@/lib/api";
import {
  getHousehold,
  listHouseholdMembers,
  regenerateInviteCode,
  countHouseholdMembers,
} from "@/lib/repo";

const MAX_MEMBROS = 2;

// Dados da casa + o codigo de convite. So membros enxergam: o codigo e'
// credencial de entrada, nao identificador publico.
export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const [casa, membros] = await Promise.all([
      getHousehold(householdId),
      listHouseholdMembers(householdId),
    ]);
    if (!casa) throw new ApiError("Casa não encontrada", 404);
    return {
      id: casa.id,
      name: casa.name,
      inviteCode: casa.inviteCode,
      membros,
      vagas: Math.max(0, MAX_MEMBROS - membros.length),
    };
  });
}

// Gera um codigo novo e invalida o anterior na hora. Serve para quando o link
// foi parar no grupo errado.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    const body = (await readJson(req)) as { acao?: string };
    if (body?.acao !== "regenerar") {
      throw new ApiError("Ação desconhecida.", 400);
    }
    const inviteCode = await regenerateInviteCode(householdId);
    return { inviteCode, vagas: Math.max(0, MAX_MEMBROS - (await countHouseholdMembers(householdId))) };
  });
}
