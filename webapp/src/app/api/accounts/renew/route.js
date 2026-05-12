import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const staleMinutes = Number(body?.staleMinutes || 90);
    const maxAccounts = Math.min(
      Math.max(Number(body?.maxAccounts || 10), 1),
      100,
    );

    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

    const accounts = await prisma.linkedInAccount.findMany({
      where: {
        OR: [
          { status: "OK", lastLoginAt: { lt: cutoff } },
          { status: "ERROR" },
          { status: "NEEDS_2FA" },
        ],
      },
      orderBy: { lastLoginAt: "asc" },
      take: maxAccounts,
      select: { id: true },
    });

    return NextResponse.json({
      queued: accounts.length,
      accountIds: accounts.map((a) => a.id),
      strategy: {
        staleMinutes,
        description:
          "Renove primeiro contas OK antigas e em seguida contas com erro para manter pool saudável.",
      },
    });
  } catch (error) {
    console.error("Accounts renew plan error:", error);
    return NextResponse.json(
      { error: "Erro ao montar plano de renovação." },
      { status: 500 },
    );
  }
}
