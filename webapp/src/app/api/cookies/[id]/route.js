import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    await prisma.cookie.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Cookie Error:", error);
    return NextResponse.json(
      { error: "Erro ao excluir cookie." },
      { status: 500 }
    );
  }
}
