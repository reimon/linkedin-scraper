import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const [activeCookies, queueStats] = await Promise.all([
    prisma.cookie.count({ where: { isActive: true } }),
    prisma.scrapeJob.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    queueStats.map(({ status, _count }) => [
      status.toLowerCase(),
      _count.status,
    ]),
  );

  let localStatus;
  if (activeCookies === 0) {
    localStatus = "unavailable";
  } else if (activeCookies === 1) {
    localStatus = "degraded";
  } else {
    localStatus = "ok";
  }

  const apifyConfigured =
    Boolean(process.env.APIFY_TOKEN) && Boolean(process.env.APIFY_ACTOR_ID);

  return NextResponse.json({
    providers: {
      "local-voyager": {
        status: localStatus,
        activeCookies,
      },
      apify: {
        status: apifyConfigured ? "configured" : "unconfigured",
        actorId: apifyConfigured ? process.env.APIFY_ACTOR_ID : null,
      },
    },
    queue: {
      queued: byStatus.queued ?? 0,
      running: byStatus.running ?? 0,
      retry: byStatus.retry ?? 0,
      success: byStatus.success ?? 0,
      failed: byStatus.failed ?? 0,
    },
    timestamp: new Date().toISOString(),
  });
}
