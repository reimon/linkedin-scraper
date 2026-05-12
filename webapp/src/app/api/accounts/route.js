import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseCookieMetadata(cookieValue) {
  if (!cookieValue) {
    return {
      hasLiAt: false,
      hasJsessionId: false,
      liAtMasked: null,
      jsessionIdMasked: null,
    };
  }

  const liAtMatch = cookieValue.match(/(?:^|;\s*)li_at=([^;]+)/i);
  const jsessionMatch = cookieValue.match(/(?:^|;\s*)JSESSIONID="?([^";]+)"?/i);

  const liAt = liAtMatch?.[1] || null;
  const jsessionId = jsessionMatch?.[1] || null;

  return {
    hasLiAt: Boolean(liAt),
    hasJsessionId: Boolean(jsessionId),
    liAtMasked: maskValue(liAt),
    jsessionIdMasked: maskValue(jsessionId),
  };
}

export async function GET() {
  try {
    const rawAccounts = await prisma.linkedInAccount.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        label: true,
        status: true,
        lastError: true,
        lastLoginAt: true,
        cookieId: true,
        createdAt: true,
      },
    });

    const cookieIds = rawAccounts
      .map((account) => account.cookieId)
      .filter(Boolean);

    const cookies = cookieIds.length
      ? await prisma.cookie.findMany({
          where: { id: { in: cookieIds } },
          select: {
            id: true,
            label: true,
            isActive: true,
            value: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];

    const cookieById = new Map(cookies.map((cookie) => [cookie.id, cookie]));

    const accounts = rawAccounts.map((account) => {
      const cookie = account.cookieId ? cookieById.get(account.cookieId) : null;
      const parsed = parseCookieMetadata(cookie?.value);
      const lastRefreshAt = cookie?.updatedAt || account.lastLoginAt || null;
      const shouldRefresh =
        account.status === "OK" &&
        (!lastRefreshAt ||
          Date.now() - new Date(lastRefreshAt).getTime() > 90 * 60 * 1000);

      return {
        ...account,
        cookie: cookie
          ? {
              id: cookie.id,
              label: cookie.label,
              isActive: cookie.isActive,
              createdAt: cookie.createdAt,
              updatedAt: cookie.updatedAt,
              ...parsed,
            }
          : null,
        shouldRefresh,
      };
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Accounts GET Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar contas." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const { email, password, label } = await request.json();

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios." },
        { status: 400 },
      );
    }

    const account = await prisma.linkedInAccount.upsert({
      where: { email: email.trim().toLowerCase() },
      create: {
        email: email.trim().toLowerCase(),
        password,
        label: label?.trim() || null,
        status: "PENDING",
      },
      update: {
        password,
        label: label?.trim() || null,
        status: "PENDING",
        lastError: null,
      },
      select: { id: true, email: true, label: true, status: true },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Accounts POST Error:", error);
    return NextResponse.json(
      { error: "Erro ao criar conta." },
      { status: 500 },
    );
  }
}
