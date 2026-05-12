import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const ENQUEUE_MAX_COUNT = 200;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeBatchCount(rawCount, fallback = 20) {
  const parsed = Number.parseInt(rawCount, 10);
  return clamp(Number.isNaN(parsed) ? fallback : parsed, 1, ENQUEUE_MAX_COUNT);
}

export function buildBackoffMs(attempts) {
  const base = 30000;
  const max = 30 * 60 * 1000;
  const factor = Math.max(1, attempts);
  const jitter = Math.round(Math.random() * 4000);
  return Math.min(base * 2 ** (factor - 1) + jitter, max);
}

export async function countQueueDepth() {
  return prisma.scrapeJob.count({
    where: { status: { in: ["QUEUED", "RETRY", "RUNNING"] } },
  });
}

export async function enqueuePendingProfiles({
  count,
  priority = 0,
  maxAttempts = 5,
}) {
  const take = normalizeBatchCount(count, 20);

  const pendingProfiles = await prisma.profile.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true },
  });

  if (pendingProfiles.length === 0) {
    return {
      scanned: 0,
      enqueued: 0,
      alreadyQueued: 0,
      queueDepth: await countQueueDepth(),
    };
  }

  let enqueued = 0;
  let alreadyQueued = 0;

  for (const profile of pendingProfiles) {
    const existingOpenJob = await prisma.scrapeJob.findFirst({
      where: {
        profileId: profile.id,
        status: { in: ["QUEUED", "RUNNING", "RETRY"] },
      },
      select: { id: true },
    });

    if (existingOpenJob) {
      alreadyQueued++;
      continue;
    }

    await prisma.scrapeJob.create({
      data: {
        profileId: profile.id,
        status: "QUEUED",
        priority,
        maxAttempts,
        nextRunAt: new Date(),
      },
    });

    enqueued++;
  }

  return {
    scanned: pendingProfiles.length,
    enqueued,
    alreadyQueued,
    queueDepth: await countQueueDepth(),
  };
}

export async function releaseStaleRunningJobs(lockTtlMs = 2 * 60 * 1000) {
  const staleBefore = new Date(Date.now() - lockTtlMs);

  const { count } = await prisma.scrapeJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: "RETRY",
      lockToken: null,
      lockedAt: null,
      nextRunAt: new Date(),
      lastErrorCode: "WORKER_STALE_LOCK",
    },
  });

  return count;
}

export async function acquireDueJobs(maxJobs = 20) {
  const limit = normalizeBatchCount(maxJobs, 20);
  const now = new Date();

  const dueJobs = await prisma.scrapeJob.findMany({
    where: {
      status: { in: ["QUEUED", "RETRY"] },
      nextRunAt: { lte: now },
    },
    orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const acquired = [];

  for (const job of dueJobs) {
    const lockToken = randomUUID();

    const { count } = await prisma.scrapeJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["QUEUED", "RETRY"] },
      },
      data: {
        status: "RUNNING",
        lockToken,
        lockedAt: now,
      },
    });

    if (count === 1) {
      acquired.push({ ...job, lockToken });
    }
  }

  return acquired;
}

export async function completeJobSuccess(jobId, lockToken, providerHint) {
  return prisma.scrapeJob.updateMany({
    where: { id: jobId, status: "RUNNING", lockToken },
    data: {
      status: "SUCCESS",
      lockToken: null,
      lockedAt: null,
      attempts: { increment: 1 },
      lastErrorCode: null,
      nextRunAt: new Date(),
      providerHint,
    },
  });
}

export async function completeJobRetry(
  job,
  lockToken,
  errorCode,
  providerHint,
) {
  const nextAttempts = job.attempts + 1;
  const delayMs = buildBackoffMs(nextAttempts);

  return prisma.scrapeJob.updateMany({
    where: { id: job.id, status: "RUNNING", lockToken },
    data: {
      status: "RETRY",
      attempts: nextAttempts,
      lastErrorCode: errorCode,
      lockToken: null,
      lockedAt: null,
      nextRunAt: new Date(Date.now() + delayMs),
      providerHint,
    },
  });
}

export async function completeJobFailed(
  jobId,
  lockToken,
  attempts,
  errorCode,
  providerHint,
) {
  return prisma.scrapeJob.updateMany({
    where: { id: jobId, status: "RUNNING", lockToken },
    data: {
      status: "FAILED",
      attempts,
      lastErrorCode: errorCode,
      lockToken: null,
      lockedAt: null,
      providerHint,
      nextRunAt: new Date(),
    },
  });
}

export async function createJobAttempt({
  jobId,
  provider,
  success,
  errorCode,
  latencyMs,
  httpStatus,
  retryAfterMs,
  diagnostics,
}) {
  return prisma.scrapeJobAttempt.create({
    data: {
      jobId,
      provider,
      success,
      errorCode,
      latencyMs,
      httpStatus,
      retryAfterMs,
      diagnostics: diagnostics ? JSON.stringify(diagnostics) : null,
    },
  });
}

export async function getQueueSummary() {
  const [queued, running, retry, success, failed] = await Promise.all([
    prisma.scrapeJob.count({ where: { status: "QUEUED" } }),
    prisma.scrapeJob.count({ where: { status: "RUNNING" } }),
    prisma.scrapeJob.count({ where: { status: "RETRY" } }),
    prisma.scrapeJob.count({ where: { status: "SUCCESS" } }),
    prisma.scrapeJob.count({ where: { status: "FAILED" } }),
  ]);

  return {
    queued,
    running,
    retry,
    success,
    failed,
    depth: queued + running + retry,
  };
}
