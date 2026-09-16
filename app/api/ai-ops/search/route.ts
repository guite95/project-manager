import { aiOpsRead, pool } from "@/lib/ai-ops/http";
import { AiOpsInputError, searchMessages } from "@/lib/ai-ops/store.mjs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return aiOpsRead(async () => {
    const reader = request.body?.getReader();
    if (!reader) throw new AiOpsInputError("검색어를 입력해 주세요.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new AiOpsInputError("검색 요청이 너무 큽니다.");
      }
      chunks.push(value);
    }
    let params;
    try {
      params = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AiOpsInputError("잘못된 검색 요청입니다.");
    }
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new AiOpsInputError("잘못된 검색 요청입니다.");
    return searchMessages(pool, params);
  });
}
