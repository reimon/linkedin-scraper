import { NextResponse } from "next/server";
import { getQueueSummary } from "@/lib/scraping/jobQueueDb";

export async function GET() {
  try {
    const summary = await getQueueSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Jobs Summary Error:", error);
    return NextResponse.json(
      { error: "Erro ao obter status da fila." },
      { status: 500 },
    );
  }
}
