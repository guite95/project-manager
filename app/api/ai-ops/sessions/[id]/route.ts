import { aiOpsRead, pool } from "@/lib/ai-ops/http";
import { querySession } from "@/lib/ai-ops/store.mjs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return aiOpsRead(async () =>
    querySession(
      pool,
      (await context.params).id,
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  );
}
