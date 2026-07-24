import { handle, requireSession } from "@/lib/api";
import { listCategories } from "@/lib/repo";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return listCategories();
  });
}
