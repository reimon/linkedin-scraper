import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const total = await prisma.profile.count();
    const missingAvatar = await prisma.profile.count({
      where: {
        profilePictureUrl: null,
        scratchAttempts: 0,
        status: "PENDING",
      },
    });

    const success = await prisma.profile.count({
      where: { status: "SUCCESS" },
    });

    const errorCount = await prisma.profile.count({
      where: { 
        status: { in: ["ERROR", "ERROR_AUTHWALL"] } 
      },
    });

    const scratched = await prisma.profile.count({
      where: {
        OR: [
          {
            scratchAttempts: {
              gt: 0,
            },
          },
          {
            status: {
              in: ["SUCCESS", "ERROR", "ERROR_AUTHWALL"],
            },
          },
        ],
      },
    });

    const attemptsAggregate = await prisma.profile.aggregate({
      _sum: {
        scratchAttempts: true,
      },
    });

    const legacyProcessedWithoutAttempts = await prisma.profile.count({
      where: {
        scratchAttempts: 0,
        status: {
          in: ["SUCCESS", "ERROR", "ERROR_AUTHWALL"],
        },
      },
    });

    return NextResponse.json({
      total,
      missingAvatar,
      success,
      error: errorCount,
      scratched,
      totalScratchAttempts:
        (attemptsAggregate._sum.scratchAttempts ?? 0) +
        legacyProcessedWithoutAttempts,
    });
  } catch (error) {
    console.error("Stats Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar estatísticas." },
      { status: 500 },
    );
  }
}
