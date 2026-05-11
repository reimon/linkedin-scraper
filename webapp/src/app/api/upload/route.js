import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

function pickFirstValue(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeLinkedInUrl(rawUrl) {
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    parsed.search = "";

    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin.toLowerCase()}${normalizedPath}`;
  } catch {
    return rawUrl.trim();
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado." },
        { status: 400 },
      );
    }

    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    for (const record of records) {
      const name = pickFirstValue(record, ["Name", "name", "Nome", "nome"]);
      const linkedinUrlRaw = pickFirstValue(record, [
        "LinkedInURL",
        "linkedinUrl",
        "url",
        "URL",
        "LinkedIn",
      ]);
      const linkedinUrl = normalizeLinkedInUrl(linkedinUrlRaw);

      if (!name || !linkedinUrl) {
        invalid++;
        continue;
      }

      // Check if exists
      const existing = await prisma.profile.findUnique({
        where: { linkedinUrl },
      });

      if (!existing) {
        await prisma.profile.create({
          data: {
            name,
            linkedinUrl,
          },
        });
        inserted++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      invalid,
      totalRows: records.length,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { error: "Erro ao processar arquivo." },
      { status: 500 },
    );
  }
}
