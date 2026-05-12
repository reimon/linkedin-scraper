import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") || "25", 10), 1),
      100,
    );


    const [total, records] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          linkedinUrl: true,
          profilePictureUrl: true,
          status: true,
          scratchAttempts: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      records,
    });
  } catch (error) {
    console.error("Records Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar registros raspados." },
      { status: 500 },
    );
  }
}
