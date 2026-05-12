import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  try {
    const { cookies } = await request.json();
    
    if (!cookies) {
      return NextResponse.json({ error: "Nenhum dado recebido." }, { status: 400 });
    }

    // The cookies string from document.cookie looks like "li_at=...; JSESSIONID=...; ..."
    // We want to store the full string or at least ensure li_at and JSESSIONID are present
    
    // Check if li_at is present
    if (!cookies.includes("li_at=")) {
      return NextResponse.json({ error: "Cookie li_at não encontrado na sessão." }, { status: 400 });
    }

    // Save as a new active cookie
    const newCookie = await prisma.cookie.create({
      data: {
        value: cookies,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, id: newCookie.id });
  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: "Erro ao sincronizar cookies." }, { status: 500 });
  }
}
