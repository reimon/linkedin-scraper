import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const cookies = await prisma.cookie.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ cookies });
  } catch (error) {
    console.error("GET Cookies Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar cookies." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { value } = await request.json();

    if (!value || typeof value !== "string") {
      return NextResponse.json(
        { error: "Valor do cookie inválido." },
        { status: 400 }
      );
    }

    const newCookie = await prisma.cookie.create({
      data: {
        value: value.trim(),
      },
    });

    return NextResponse.json({ cookie: newCookie }, { status: 201 });
  } catch (error) {
    console.error("POST Cookie Error:", error);
    return NextResponse.json(
      { error: "Erro ao adicionar cookie." },
      { status: 500 }
    );
  }
}
