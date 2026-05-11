import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes("\r") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export async function GET() {
  try {
    const profiles = await prisma.profile.findMany({
      orderBy: {
        createdAt: "asc",
      },
      select: {
        name: true,
        linkedinUrl: true,
        profilePictureUrl: true,
        status: true,
        scratchAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const header = [
      "Name",
      "LinkedInURL",
      "ProfilePictureURL",
      "Status",
      "ScratchAttempts",
      "CreatedAt",
      "UpdatedAt",
    ];

    const lines = [header.join(",")];
    for (const profile of profiles) {
      lines.push(
        [
          csvEscape(profile.name),
          csvEscape(profile.linkedinUrl),
          csvEscape(profile.profilePictureUrl),
          csvEscape(profile.status),
          csvEscape(profile.scratchAttempts),
          csvEscape(profile.createdAt.toISOString()),
          csvEscape(profile.updatedAt.toISOString()),
        ].join(","),
      );
    }

    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "")
      .replaceAll("-", "")
      .replace("T", "_")
      .slice(0, 15);
    const filename = `linkedin_profiles_export_${timestamp}.csv`;
    const csv = `\uFEFF${lines.join("\n")}`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export Error:", error);
    return NextResponse.json(
      { error: "Erro ao exportar CSV." },
      { status: 500 },
    );
  }
}
