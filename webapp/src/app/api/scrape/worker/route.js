import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  acquireDueJobs,
  completeJobFailed,
  completeJobRetry,
  completeJobSuccess,
  createJobAttempt,
  normalizeBatchCount,
  releaseStaleRunningJobs,
} from "@/lib/scraping/jobQueueDb";
import { resolveLocalVoyagerPhoto } from "@/lib/scraping/providers/localVoyagerProvider";
import { resolveApifyPhoto } from "@/lib/scraping/providers/apifyProvider";
import { shouldFallbackToSecondary } from "@/lib/scraping/providerPolicy";

const PRIMARY_PROVIDER_NAME = "local-voyager";
const SECONDARY_PROVIDER_NAME = "apify";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const maxJobs = normalizeBatchCount(body?.maxJobs, 20);

    const releasedLocks = await releaseStaleRunningJobs();
    const jobs = await acquireDueJobs(maxJobs);

    if (jobs.length === 0) {
      return NextResponse.json({
        processed: 0,
        success: 0,
        retry: 0,
        failed: 0,
        releasedLocks,
        providers: {
          [PRIMARY_PROVIDER_NAME]: 0,
          [SECONDARY_PROVIDER_NAME]: 0,
        },
      });
    }

    const activeCookies = await prisma.cookie.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { value: true },
    });

    const cookieValues = activeCookies.map((cookie) => cookie.value);

    let success = 0;
    let retry = 0;
    let failed = 0;
    const providerUsage = {
      [PRIMARY_PROVIDER_NAME]: 0,
      [SECONDARY_PROVIDER_NAME]: 0,
    };

    for (const job of jobs) {
      const profile = await prisma.profile.findUnique({
        where: { id: job.profileId },
        select: { id: true, linkedinUrl: true },
      });

      if (!profile) {
        await completeJobFailed(
          job.id,
          job.lockToken,
          job.attempts + 1,
          "PROFILE_NOT_FOUND",
          PRIMARY_PROVIDER_NAME,
        );
        failed++;
        continue;
      }

      const startedAt = Date.now();
      const primaryResult = await resolveLocalVoyagerPhoto({
        linkedinUrl: profile.linkedinUrl,
        cookieValues,
      });
      const latencyMs = Date.now() - startedAt;
      providerUsage[PRIMARY_PROVIDER_NAME] += 1;

      await createJobAttempt({
        jobId: job.id,
        provider: PRIMARY_PROVIDER_NAME,
        success: primaryResult.ok,
        errorCode: primaryResult.ok ? null : primaryResult.errorCode,
        latencyMs,
        httpStatus: primaryResult.diagnostics?.status ?? null,
        retryAfterMs: primaryResult.diagnostics?.retryAfterMs ?? null,
        diagnostics: primaryResult.diagnostics,
      });

      let finalResult = primaryResult;
      let finalProvider = PRIMARY_PROVIDER_NAME;

      if (
        !primaryResult.ok &&
        shouldFallbackToSecondary(primaryResult.errorCode)
      ) {
        const secondaryStartedAt = Date.now();
        const secondaryResult = await resolveApifyPhoto({
          linkedinUrl: profile.linkedinUrl,
        });
        const secondaryLatencyMs = Date.now() - secondaryStartedAt;
        providerUsage[SECONDARY_PROVIDER_NAME] += 1;

        await createJobAttempt({
          jobId: job.id,
          provider: SECONDARY_PROVIDER_NAME,
          success: secondaryResult.ok,
          errorCode: secondaryResult.ok ? null : secondaryResult.errorCode,
          latencyMs: secondaryLatencyMs,
          httpStatus: secondaryResult.diagnostics?.status ?? null,
          retryAfterMs: secondaryResult.diagnostics?.retryAfterMs ?? null,
          diagnostics: secondaryResult.diagnostics,
        });

        if (secondaryResult.ok) {
          finalResult = secondaryResult;
          finalProvider = SECONDARY_PROVIDER_NAME;
        }
      }

      await prisma.profile.update({
        where: { id: profile.id },
        data: {
          scratchAttempts: { increment: 1 },
        },
      });

      if (finalResult.ok && finalResult.photoUrl) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            profilePictureUrl: finalResult.photoUrl,
            status: "SUCCESS",
          },
        });

        await completeJobSuccess(job.id, job.lockToken, finalProvider);
        success++;
        continue;
      }

      const nextAttempts = job.attempts + 1;
      const shouldRetry = nextAttempts < job.maxAttempts;

      if (shouldRetry) {
        await completeJobRetry(
          job,
          job.lockToken,
          finalResult.errorCode || "UNKNOWN",
          finalProvider,
        );
        retry++;
        continue;
      }

      await prisma.profile.update({
        where: { id: profile.id },
        data: {
          status:
            finalResult.errorCode === "AUTHWALL" ? "ERROR_AUTHWALL" : "ERROR",
        },
      });

      await completeJobFailed(
        job.id,
        job.lockToken,
        nextAttempts,
        finalResult.errorCode || "UNKNOWN",
        finalProvider,
      );
      failed++;
    }

    return NextResponse.json({
      processed: jobs.length,
      success,
      retry,
      failed,
      releasedLocks,
      providers: providerUsage,
    });
  } catch (error) {
    console.error("Worker Tick Error:", error);
    return NextResponse.json(
      { error: "Erro ao processar fila." },
      { status: 500 },
    );
  }
}
