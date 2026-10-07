import { NextResponse } from "next/server";
import { serverEnv } from "@/server/env";
import { integrationStatus, isLive } from "@/server/integrations/registry";

/** Estado del servicio y de cada integración (solo booleanos, nunca valores). */
export function GET() {
  const env = serverEnv();
  return NextResponse.json(
    { service: "black-crm", mode: isLive(env) ? "live" : "demo", integrations: integrationStatus(env) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
