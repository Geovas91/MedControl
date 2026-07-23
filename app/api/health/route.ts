import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET() {
  logger.info("Health check ok", {
    component: "application",
    status: "ok"
  });

  return noStore(
    NextResponse.json({ status: "ok" })
  );
}
