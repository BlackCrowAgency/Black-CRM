"use client";

import { Cinema } from "@/components/cinema/Cinema";
import { EngineProvider } from "./EngineProvider";

/** La escena y el asistente comparten el mismo motor de datos. */
export function Experience() {
  return (
    <EngineProvider>
      <Cinema />
    </EngineProvider>
  );
}
