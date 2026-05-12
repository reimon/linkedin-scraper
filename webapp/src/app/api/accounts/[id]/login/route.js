import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chromium } from "playwright";

const LOGIN_URL = "https://www.linkedin.com/login";
const FEED_URL_PATTERN = /linkedin\.com\/feed/;
const CHECKPOINT_PATTERN = /linkedin\.com\/checkpoint|\/uas\/login\?|\/verify/;

const COOKIE_KEYS = [
  "li_at",
  "JSESSIONID",
  "lidc",
  "bcookie",
  "bscookie",
  "li_gc",
];

async function doLinkedInLogin(email, password) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "pt-BR",
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    const page = await context.newPage();

    await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Preencher credenciais
    await page.waitForSelector("#username", { timeout: 10000 });
    await page.fill("#username", email);
    await page.fill("#password", password);

    // Pequeno delay humano antes de clicar
    await page.waitForTimeout(400 + Math.floor(Math.random() * 400));
    await page.click("button[type=submit]");

    // Aguardar redirecionamento
    await page.waitForURL(
      (url) =>
        FEED_URL_PATTERN.test(url.toString()) ||
        CHECKPOINT_PATTERN.test(url.toString()) ||
        url.toString().includes("/login"),
      { timeout: 20000 },
    );

    const finalUrl = page.url();

    if (CHECKPOINT_PATTERN.test(finalUrl)) {
      return {
        ok: false,
        status: "NEEDS_2FA",
        error: "Verificação em 2 etapas necessária.",
      };
    }

    if (!FEED_URL_PATTERN.test(finalUrl)) {
      // Verificar se há mensagem de erro na página
      const errorText = await page
        .locator("#error-for-username, .form__label--error, [data-id='error']")
        .textContent()
        .catch(() => null);
      return {
        ok: false,
        status: "ERROR",
        error: errorText?.trim() || "Login falhou. Verifique as credenciais.",
      };
    }

    // Sucesso — extrair cookies
    await page.waitForTimeout(1000); // deixar cookies de sessão assentarem
    const cookies = await context.cookies("https://www.linkedin.com");

    const cookieMap = {};
    for (const c of cookies) {
      if (COOKIE_KEYS.includes(c.name)) {
        cookieMap[c.name] = c.value;
      }
    }

    if (!cookieMap.li_at) {
      return {
        ok: false,
        status: "ERROR",
        error: "li_at não encontrado após login.",
      };
    }

    // Montar string de cookie
    const parts = [];
    if (cookieMap.li_at) parts.push(`li_at=${cookieMap.li_at}`);
    if (cookieMap.JSESSIONID)
      parts.push(`JSESSIONID="${cookieMap.JSESSIONID}"`);
    if (cookieMap.lidc) parts.push(`lidc=${cookieMap.lidc}`);
    if (cookieMap.bcookie) parts.push(`bcookie="${cookieMap.bcookie}"`);
    if (cookieMap.bscookie) parts.push(`bscookie="${cookieMap.bscookie}"`);
    if (cookieMap.li_gc) parts.push(`li_gc=${cookieMap.li_gc}`);

    const cookieString = parts.join("; ");

    return { ok: true, cookieString };
  } finally {
    await browser.close();
  }
}

export async function POST(request, { params }) {
  const { id } = params;

  const account = await prisma.linkedInAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json(
      { error: "Conta não encontrada." },
      { status: 404 },
    );
  }

  // Marcar como em progresso
  await prisma.linkedInAccount.update({
    where: { id },
    data: { status: "PENDING", lastError: null },
  });

  try {
    const result = await doLinkedInLogin(account.email, account.password);

    if (!result.ok) {
      await prisma.linkedInAccount.update({
        where: { id },
        data: {
          status: result.status,
          lastError: result.error,
          lastLoginAt: new Date(),
        },
      });
      return NextResponse.json(
        { ok: false, status: result.status, error: result.error },
        { status: 422 },
      );
    }

    // Upsert do Cookie: reusar o cookie existente da conta ou criar novo
    let cookie;
    if (account.cookieId) {
      cookie = await prisma.cookie.update({
        where: { id: account.cookieId },
        data: {
          value: result.cookieString,
          isActive: true,
          label: account.label || account.email,
          updatedAt: new Date(),
        },
      });
    } else {
      cookie = await prisma.cookie.create({
        data: {
          value: result.cookieString,
          isActive: true,
          label: account.label || account.email,
          accountId: id,
        },
      });
    }

    await prisma.linkedInAccount.update({
      where: { id },
      data: {
        status: "OK",
        lastError: null,
        lastLoginAt: new Date(),
        cookieId: cookie.id,
      },
    });

    return NextResponse.json({
      ok: true,
      cookieId: cookie.id,
      provider: "voyager",
      message: "Login realizado com sucesso.",
    });
  } catch (error) {
    console.error(`Account login error [${account.email}]:`, error);
    const msg = error?.message || "Erro inesperado.";
    await prisma.linkedInAccount.update({
      where: { id },
      data: { status: "ERROR", lastError: msg, lastLoginAt: new Date() },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
