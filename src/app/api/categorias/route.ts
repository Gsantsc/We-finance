import { handle, requireHousehold } from "@/lib/api";
import { listCategories } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    await requireHousehold();
    return listCategories();
  });
}
