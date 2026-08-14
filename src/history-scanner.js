import { parseArchiveMonth, validateUsername } from "./chess-com-client.js";
import { getGameIdentities } from "./game-identity.js";
import { COUNTING_ASSUMPTIONS, createLossAccumulator } from "./lost-pieces.js";

const BYTES_PER_MEBIBYTE = 1024 * 1024;

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function toMiB(bytes) {
  return round(bytes / BYTES_PER_MEBIBYTE);
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultMemoryUsage() {
  const runtimeProcess = globalThis.process;
  return typeof runtimeProcess?.memoryUsage === "function"
    ? runtimeProcess.memoryUsage()
    : null;
}

function uniqueSortedArchives(archiveUrls) {
  const archivesByMonth = new Map();

  for (const archiveUrl of archiveUrls) {
    const { year, month } = parseArchiveMonth(archiveUrl);
    archivesByMonth.set(`${year}/${month}`, { year, month });
  }

  return [...archivesByMonth.values()].sort((left, right) =>
    `${left.year}${left.month}`.localeCompare(`${right.year}${right.month}`));
}

function createMemoryTracker(memoryUsageImpl) {
  const unavailable = {
    available: false,
    approximate: false,
    reason: "notAvailableInThisEnvironment",
  };
  const baseline = memoryUsageImpl?.();

  if (
    !baseline
    || !Number.isFinite(baseline.rss)
    || !Number.isFinite(baseline.heapUsed)
  ) {
    return {
      capture: () => ({ ...unavailable }),
      report: () => ({ ...unavailable }),
    };
  }

  let current = baseline;
  let peakRss = baseline.rss;
  let peakHeapUsed = baseline.heapUsed;

  return {
    capture() {
      current = memoryUsageImpl();
      peakRss = Math.max(peakRss, current.rss);
      peakHeapUsed = Math.max(peakHeapUsed, current.heapUsed);
      return {
        available: true,
        approximate: true,
        rssMiB: toMiB(current.rss),
        heapUsedMiB: toMiB(current.heapUsed),
      };
    },

    report() {
      this.capture();
      return {
        available: true,
        approximate: true,
        baselineRssMiB: toMiB(baseline.rss),
        finalRssMiB: toMiB(current.rss),
        peakRssMiB: toMiB(peakRss),
        rssChangeMiB: toMiB(current.rss - baseline.rss),
        baselineHeapUsedMiB: toMiB(baseline.heapUsed),
        finalHeapUsedMiB: toMiB(current.heapUsed),
        peakHeapUsedMiB: toMiB(peakHeapUsed),
        heapUsedChangeMiB: toMiB(current.heapUsed - baseline.heapUsed),
      };
    },
  };
}

export async function scanAllHistory(
  client,
  requestedUsername,
  {
    onProgress = async () => {},
    nowImpl = defaultNow,
    memoryUsageImpl = defaultMemoryUsage,
  } = {},
) {
  const startedAt = nowImpl();
  const memory = createMemoryTracker(memoryUsageImpl);
  const username = validateUsername(requestedUsername);
  const profile = await client.getPlayer(username);
  const canonicalUsername = validateUsername(profile.username);
  const archiveUrls = await client.getArchiveUrls(canonicalUsername);
  const archives = uniqueSortedArchives(archiveUrls);
  const player = {
    requestedUsername: username,
    canonicalUsername,
    profileUrl: profile["@id"],
  };
  const accumulator = createLossAccumulator(player);
  const seenGameIds = new Set();
  let archiveMonthsProcessed = 0;
  let gameRecordsFound = 0;
  let duplicateGameRecordsSkipped = 0;
  let latestGameEndTime = 0;

  const progressEvent = (stage, currentArchive = null) => {
    const summary = accumulator.snapshot();
    return {
      type: "historyProgress",
      stage,
      mode: "all",
      username: canonicalUsername,
      archives: {
        processed: archiveMonthsProcessed,
        total: archives.length,
        current: currentArchive,
      },
      games: {
        recordsFound: gameRecordsFound,
        uniqueProcessed: summary.uniqueGamesProcessed,
        examined: summary.gamesExamined,
        skipped: summary.gamesSkipped,
        duplicatesSkipped: duplicateGameRecordsSkipped,
      },
      elapsedMs: round(nowImpl() - startedAt),
      memory: memory.capture(),
    };
  };

  await onProgress(progressEvent("scanStarted"));

  for (const archive of archives) {
    await onProgress(progressEvent("archiveStarted", archive));
    const monthlyGames = await client.getMonthlyGames(
      canonicalUsername,
      archive.year,
      archive.month,
    );
    memory.capture();

    for (const game of monthlyGames) {
      gameRecordsFound += 1;
      latestGameEndTime = Math.max(latestGameEndTime, Number(game.end_time ?? 0));
      const gameIds = await getGameIdentities(game);

      if (gameIds.some((gameId) => seenGameIds.has(gameId))) {
        duplicateGameRecordsSkipped += 1;
        continue;
      }

      for (const gameId of gameIds) {
        seenGameIds.add(gameId);
      }
      accumulator.addGame(game);
    }

    archiveMonthsProcessed += 1;
    await onProgress(progressEvent("archiveCompleted", archive));
  }

  const summary = accumulator.snapshot();
  const durationMs = round(nowImpl() - startedAt);
  const result = {
    mode: "all",
    username: canonicalUsername,
    archiveMonthsFound: archives.length,
    archiveMonthsProcessed,
    gameRecordsFound,
    ...summary,
    duplicateGameRecordsSkipped,
    source: {
      provider: "Chess.com PubAPI",
      firstArchive: archives[0] ? `${archives[0].year}/${archives[0].month}` : null,
      lastArchive: archives.length > 0
        ? `${archives[archives.length - 1].year}/${archives[archives.length - 1].month}`
        : null,
      latestGameEndedAt:
        latestGameEndTime > 0 ? new Date(latestGameEndTime * 1_000).toISOString() : null,
    },
    performance: {
      durationMs,
      durationSeconds: round(durationMs / 1_000),
      memory: memory.report(),
    },
    assumptions: [...COUNTING_ASSUMPTIONS],
  };

  await onProgress(progressEvent("scanCompleted"));
  return result;
}
