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
    const verbose = body?.verbose !== false;

    const executionLogs = [];
    const pushLog = (step, message, meta = null, level = "info") => {
      if (!verbose) return;
      executionLogs.push({
        ts: new Date().toISOString(),
        step,
        level,
        message,
        meta,
      });
    };

    pushLog("worker.start", "Worker iniciado", { maxJobs });

    const releasedLocks = await releaseStaleRunningJobs();
    pushLog("queue.release-stale", "Locks stale liberados", {
      releasedLocks,
    });

    const jobs = await acquireDueJobs(maxJobs);
    pushLog("queue.acquire", "Jobs adquiridos para processamento", {
      acquired: jobs.length,
    });

    if (jobs.length === 0) {
      pushLog(
        "worker.idle",
        "Nenhum job pronto para processamento",
        null,
        "warn",
      );
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
        logs: executionLogs,
      });
    }

    const activeCookies = await prisma.cookie.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { value: true },
    });

    pushLog("cookies.load", "Cookies ativos carregados", {
      activeCookies: activeCookies.length,
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
      pushLog("job.start", "Iniciando processamento de job", {
        jobId: job.id,
        profileId: job.profileId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      });

      const profile = await prisma.profile.findUnique({
        where: { id: job.profileId },
        select: { id: true, linkedinUrl: true },
      });

      if (!profile) {
        pushLog(
          "job.profile-missing",
          "Perfil nao encontrado para o job",
          {
            jobId: job.id,
            profileId: job.profileId,
          },
          "error",
        );

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

      pushLog(
        "provider.primary",
        "Tentativa no provider primario concluida",
        {
          jobId: job.id,
          provider: PRIMARY_PROVIDER_NAME,
          ok: primaryResult.ok,
          errorCode: primaryResult.errorCode || null,
          latencyMs,
          httpStatus: primaryResult.diagnostics?.status ?? null,
          retryAfterMs: primaryResult.diagnostics?.retryAfterMs ?? null,
        },
        primaryResult.ok ? "info" : "warn",
      );

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
        pushLog(
          "provider.fallback",
          "Fallback para provider secundario",
          {
            jobId: job.id,
            from: PRIMARY_PROVIDER_NAME,
            to: SECONDARY_PROVIDER_NAME,
            reason: primaryResult.errorCode || "UNKNOWN",
          },
          "warn",
        );

        const secondaryStartedAt = Date.now();
        const secondaryResult = await resolveApifyPhoto({
          linkedinUrl: profile.linkedinUrl,
        });
        const secondaryLatencyMs = Date.now() - secondaryStartedAt;
        providerUsage[SECONDARY_PROVIDER_NAME] += 1;

        pushLog(
          "provider.secondary",
          "Tentativa no provider secundario concluida",
          {
            jobId: job.id,
            provider: SECONDARY_PROVIDER_NAME,
            ok: secondaryResult.ok,
            errorCode: secondaryResult.errorCode || null,
            latencyMs: secondaryLatencyMs,
            httpStatus: secondaryResult.diagnostics?.status ?? null,
            retryAfterMs: secondaryResult.diagnostics?.retryAfterMs ?? null,
          },
          secondaryResult.ok ? "info" : "warn",
        );

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
        pushLog("job.success", "Job concluido com sucesso", {
          jobId: job.id,
          provider: finalProvider,
          photoUrl: finalResult.photoUrl,
        });

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
        pushLog(
          "job.retry",
          "Job movido para retry",
          {
            jobId: job.id,
            provider: finalProvider,
            errorCode: finalResult.errorCode || "UNKNOWN",
            attempt: nextAttempts,
            maxAttempts: job.maxAttempts,
          },
          "warn",
        );

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

      pushLog(
        "job.failed",
        "Job finalizado em falha",
        {
          jobId: job.id,
          provider: finalProvider,
          errorCode: finalResult.errorCode || "UNKNOWN",
          attempts: nextAttempts,
        },
        "error",
      );

      failed++;
    }

    pushLog("worker.done", "Worker finalizado", {
      processed: jobs.length,
      success,
      retry,
      failed,
      providers: providerUsage,
    });

    return NextResponse.json({
      processed: jobs.length,
      success,
      retry,
      failed,
      releasedLocks,
      providers: providerUsage,
      logs: executionLogs,
    });
  } catch (error) {
    console.error("Worker Tick Error:", error);
    return NextResponse.json(
      { error: "Erro ao processar fila." },
      { status: 500 },
    );
  }
}
