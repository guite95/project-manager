import { aiOpsRead, pool } from "@/lib/ai-ops/http";
import { queryOverview } from "@/lib/ai-ops/store.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return aiOpsRead(() =>
    queryOverview(pool, Object.fromEntries(new URL(request.url).searchParams)),
  );
}
