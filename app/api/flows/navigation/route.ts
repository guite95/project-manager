import { accessibleCatalog } from '@/lib/access/catalog';
import { NextResponse } from "next/server";
import { toFlowNavigation } from "@/lib/server/flow-catalog-store";

export async function GET() {
  return NextResponse.json(toFlowNavigation(await accessibleCatalog()), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
