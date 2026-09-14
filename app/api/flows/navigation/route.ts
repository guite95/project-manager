import { NextResponse } from "next/server";
import { readFlowCatalog, toFlowNavigation } from "@/lib/server/flow-catalog-store";

export async function GET() {
  return NextResponse.json(toFlowNavigation(await readFlowCatalog()), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
