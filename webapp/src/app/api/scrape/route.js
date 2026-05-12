import { NextResponse } from "next/server";
import {
  enqueuePendingProfiles,
  normalizeBatchCount,
} from "@/lib/scraping/jobQueueDb";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = normalizeBatchCount(body?.count, 20);
    const priority = Number.isFinite(body?.priority) ? body.priority : 0;

    const result = await enqueuePendingProfiles({
      count,
      priority,
      maxAttempts: 5,
    });

    return NextResponse.json({
      mode: "enqueue",
      scanned: result.scanned,
      enqueued: result.enqueued,
      alreadyQueued: result.alreadyQueued,
      queueDepth: result.queueDepth,
      processed: result.enqueued,
      success: 0,
      message:
        result.enqueued > 0
          ? "Perfis enfileirados. Execute /api/scrape/worker para processar."
          : "Nenhum perfil novo para enfileirar.",
    });
  } catch (error) {
    console.error("Scrape Enqueue Error:", error);
    return NextResponse.json(
      { error: "Erro ao enfileirar perfis." },
      { status: 500 },
    );
  }
}
