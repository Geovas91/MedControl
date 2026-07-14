import { NextResponse } from "next/server";
import { appConfig } from "@/config/app";
import { logger } from "@/lib/logger";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function basePayload() {
  return {
    service: appConfig.serviceName,
    environment: appConfig.environment,
    version: appConfig.version,
    timestamp: new Date().toISOString()
  };
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET() {
  const configurationOk = hasSupabaseConfig();

  if (!configurationOk) {
    logger.warn("Health check degraded", {
      component: "configuration",
      status: "degraded"
    });

    return noStore(
      NextResponse.json(
        {
          status: "degraded",
          ...basePayload(),
          components: {
            application: "ok",
            configuration: "degraded"
          }
        },
        { status: 503 }
      )
    );
  }

  logger.info("Health check ok", {
    component: "application",
    status: "ok"
  });

  return noStore(
    NextResponse.json({
      status: "ok",
      ...basePayload()
    })
  );
}
