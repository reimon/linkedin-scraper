import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request, { params }) {
  try {
    const { id } = params;

    const account = await prisma.linkedInAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada." },
        { status: 404 },
      );
    }

    if (account.cookieId) {
      await prisma.cookie.updateMany({
        where: { id: account.cookieId },
        data: { isActive: false },
      });
    }

    await prisma.linkedInAccount.update({
      where: { id },
      data: {
        status: "PENDING",
        lastError: null,
      },
    });

    return NextResponse.json({ ok: true, message: "Logout realizado." });
  } catch (error) {
    console.error("Account LOGOUT Error:", error);
    return NextResponse.json(
      { error: "Erro ao fazer logout." },
      { status: 500 },
    );
  }
}
