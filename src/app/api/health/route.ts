import { NextResponse } from "next/server";

/**
 * Minimal liveness check proving the App Router boots.
 * Does not require database connectivity in Step 1.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ai-pdf-tutor",
    step: 1,
    timestamp: new Date().toISOString(),
  });
}
