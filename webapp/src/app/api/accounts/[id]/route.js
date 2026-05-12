import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request, { params }) {
  try {
    const { id } = params;

    const account = await prisma.linkedInAccount.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        label: true,
        status: true,
        lastError: true,
        lastLoginAt: true,
        cookieId: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Account GET Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar conta." },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    const account = await prisma.linkedInAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada." },
        { status: 404 },
      );
    }

    // Desativar o cookie vinculado se existir
    if (account.cookieId) {
      await prisma.cookie.updateMany({
        where: { id: account.cookieId },
        data: { isActive: false },
      });
    }

    await prisma.linkedInAccount.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Account DELETE Error:", error);
    return NextResponse.json(
      { error: "Erro ao remover conta." },
      { status: 500 },
    );
  }
}
