import { handle, requireHousehold } from "@/lib/api";
import { listHouseholdMembers } from "@/lib/repo";

// Membros da casa. A tela de entidades usa para escolher o dono (owner_id).
export async function GET() {
  return handle(async () => {
    const { householdId } = await requireHousehold();
    return listHouseholdMembers(householdId);
  });
}
