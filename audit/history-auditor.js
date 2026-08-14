import { analyzeGame } from "../src/lost-pieces.js";
import { getGameIdentities } from "../src/game-identity.js";
import { parseArchiveMonth, validateUsername } from "../src/chess-com-client.js";
import { analyzeGameByConservation, LOSS_KEYS } from "./conservation-validator.js";
import {
  DEFAULT_AUDIT_SEED,
  SAMPLE_STRATEGY,
  selectDeterministicChronologicalSample,
} from "./deterministic-sampler.js";

function emptyLosses() {
  return {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
  };
}

function addLosses(target, source) {
  for (const key of LOSS_KEYS) {
    target[key] += source[key];
  }
}

function lossesEqual(left, right) {
  return LOSS_KEYS.every((key) => left[key] === right[key]);
}

function lossDifference(reference, conservation) {
  return Object.fromEntries(
    LOSS_KEYS.map((key) => [key, reference[key] - conservation[key]]),
  );
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function uniqueSortedArchives(archiveUrls) {
  const archives = new Map();

  for (const archiveUrl of archiveUrls) {
    const { year, month } = parseArchiveMonth(archiveUrl);
    archives.set(`${year}/${month}`, { year, month, key: `${year}/${month}` });
  }

  return [...archives.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function serializeAnalysisError(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    reason: typeof error?.reason === "string" ? error.reason : "unexpectedError",
    message: typeof error?.message === "string" ? error.message : String(error),
  };
}

function endedAtForGame(game) {
  const endTime = Number(game?.end_time ?? 0);
  return Number.isFinite(endTime) && endTime > 0
    ? new Date(endTime * 1_000).toISOString()
    : null;
}

function primaryIdentity(identities) {
  return identities.find((identity) => identity.startsWith("url:"))
    ?? identities.find((identity) => identity.startsWith("uuid:"))
    ?? identities[0];
}

async function sha256Text(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export async function auditAllHistoryLosses(
  client,
  requestedUsername,
  {
    seed = DEFAULT_AUDIT_SEED,
    sampleSize = 20,
    onProgress = async () => {},
    nowImpl = defaultNow,
    dateNowImpl = Date.now,
    referenceAnalyze = analyzeGame,
    conservationAnalyze = analyzeGameByConservation,
    getIdentities = getGameIdentities,
  } = {},
) {
  if (!Number.isInteger(sampleSize) || sampleSize < 1) {
    throw new TypeError("Örnek büyüklüğü pozitif bir tam sayı olmalı.");
  }

  const startedAt = nowImpl();
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
  const seenGameIds = new Set();
  const corpusIdentities = [];
  const sampleCandidates = [];
  const mismatches = [];
  const notComparableGames = [];
  const notComparableByReason = {};
  const identityConflicts = [];
  const referenceTotals = emptyLosses();
  const conservationTotals = emptyLosses();
  let archiveMonthsProcessed = 0;
  let gameRecordsFound = 0;
  let uniqueGameRecords = 0;
  let duplicateGameRecordsSkipped = 0;
  let standardGames = 0;
  let nonStandardGamesSkipped = 0;
  let referenceGamesAnalyzed = 0;
  let conservationGamesAnalyzed = 0;
  let auditedGames = 0;
  let matchingGames = 0;
  let mismatchingGames = 0;

  const progressEvent = (stage, currentArchive = null) => ({
    type: "lossAuditProgress",
    stage,
    username: canonicalUsername,
    archives: {
      processed: archiveMonthsProcessed,
      total: archives.length,
      current: currentArchive,
    },
    games: {
      recordsFound: gameRecordsFound,
      unique: uniqueGameRecords,
      standard: standardGames,
      audited: auditedGames,
      matching: matchingGames,
      mismatching: mismatchingGames,
      notComparable: standardGames - auditedGames,
      duplicatesSkipped: duplicateGameRecordsSkipped,
    },
    elapsedMs: round(nowImpl() - startedAt),
  });

  await onProgress(progressEvent("auditStarted"));

  for (const archive of archives) {
    await onProgress(progressEvent("archiveStarted", archive));
    const monthlyGames = await client.getMonthlyGames(
      canonicalUsername,
      archive.year,
      archive.month,
    );

    for (const game of monthlyGames) {
      gameRecordsFound += 1;
      const identities = await getIdentities(game);
      const matchedIdentities = identities.filter((identity) => seenGameIds.has(identity));
      if (matchedIdentities.length > 0) {
        duplicateGameRecordsSkipped += 1;
        const unseenIdentities = identities.filter((identity) => !seenGameIds.has(identity));
        for (const identity of unseenIdentities) {
          seenGameIds.add(identity);
        }
        if (unseenIdentities.length > 0) {
          identityConflicts.push({
            url: typeof game.url === "string" ? game.url : null,
            matchedIdentities,
            unseenIdentities,
          });
        }
        continue;
      }

      for (const identity of identities) {
        seenGameIds.add(identity);
      }

      uniqueGameRecords += 1;
      const identity = primaryIdentity(identities);
      corpusIdentities.push(identity);

      if (game.rules !== "chess") {
        nonStandardGamesSkipped += 1;
        continue;
      }

      standardGames += 1;
      let reference;
      let conservation;
      let referenceError;
      let conservationError;

      try {
        reference = referenceAnalyze(game, player);
        referenceGamesAnalyzed += 1;
      } catch (error) {
        referenceError = serializeAnalysisError(error);
      }

      try {
        conservation = conservationAnalyze(game, player);
        conservationGamesAnalyzed += 1;
      } catch (error) {
        conservationError = serializeAnalysisError(error);
      }

      const endedAt = endedAtForGame(game);
      const commonGameDetails = {
        identity,
        url: typeof game.url === "string" ? game.url : null,
        archive: archive.key,
        endedAt,
        date: endedAt?.slice(0, 10) ?? null,
      };

      if (!reference || !conservation) {
        const reasonKey = [
          referenceError ? `reference:${referenceError.reason}` : "reference:ok",
          conservationError ? `conservation:${conservationError.reason}` : "conservation:ok",
        ].join("|");
        increment(notComparableByReason, reasonKey);
        notComparableGames.push({
          ...commonGameDetails,
          playerColor: conservation?.playerColor ?? reference?.playerColor ?? null,
          reference: reference
            ? { status: "analyzed", playerColor: reference.playerColor, losses: reference.losses }
            : { status: "error", error: referenceError },
          conservation: conservation
            ? {
                status: "analyzed",
                playerColor: conservation.playerColor,
                losses: conservation.losses,
              }
            : { status: "error", error: conservationError },
        });
        continue;
      }

      auditedGames += 1;
      // Karşılaştırılan toplamlar aynı maç kümesine ait kalmalı; iki yöntemden
      // biri sonuç üretemezse o kayıt iki tarafa da eklenmez.
      addLosses(referenceTotals, reference.losses);
      addLosses(conservationTotals, conservation.losses);
      const sameColor = reference.playerColor === conservation.playerColor;
      const sameLosses = lossesEqual(reference.losses, conservation.losses);

      if (!sameColor || !sameLosses) {
        mismatchingGames += 1;
        mismatches.push({
          ...commonGameDetails,
          playerColor: conservation.playerColor,
          colorByMethod: {
            reference: reference.playerColor,
            conservation: conservation.playerColor,
          },
          reference: reference.losses,
          conservation: conservation.losses,
          differenceReferenceMinusConservation: lossDifference(
            reference.losses,
            conservation.losses,
          ),
        });
        continue;
      }

      matchingGames += 1;
      sampleCandidates.push({
        ...commonGameDetails,
        endTime: Number(game.end_time ?? 0),
        playerColor: conservation.playerColor,
        losses: { ...conservation.losses },
        methodsAgree: true,
      });
    }

    archiveMonthsProcessed += 1;
    await onProgress(progressEvent("archiveCompleted", archive));
  }

  const equalByPiece = Object.fromEntries(
    LOSS_KEYS.map((key) => [key, referenceTotals[key] === conservationTotals[key]]),
  );
  const allTotalsEqual = Object.values(equalByPiece).every(Boolean);
  const selectedSample = selectDeterministicChronologicalSample(sampleCandidates, {
    seed,
    size: sampleSize,
  }).map(({ endTime: _endTime, ...sample }) => sample);
  const durationMs = round(nowImpl() - startedAt);
  const corpusFingerprintSha256 = await sha256Text(
    [...corpusIdentities].sort().join("\n"),
  );
  const notComparable = standardGames - auditedGames;
  const verified = mismatchingGames === 0
    && notComparable === 0
    && allTotalsEqual
    && auditedGames === standardGames
    && identityConflicts.length === 0;

  const report = {
    schemaVersion: 1,
    auditMethod: "piece-conservation-v1",
    referenceMethod: "captured-move-events-v1",
    generatedAt: new Date(dateNowImpl()).toISOString(),
    requestedUsername: username,
    username: canonicalUsername,
    corpusFingerprintSha256,
    archives: {
      found: archives.length,
      processed: archiveMonthsProcessed,
      first: archives[0]?.key ?? null,
      last: archives.at(-1)?.key ?? null,
    },
    records: {
      found: gameRecordsFound,
      unique: uniqueGameRecords,
      duplicatesSkipped: duplicateGameRecordsSkipped,
      identityConflicts: identityConflicts.length,
      standard: standardGames,
      nonStandardSkipped: nonStandardGamesSkipped,
    },
    comparison: {
      audited: auditedGames,
      matching: matchingGames,
      mismatching: mismatchingGames,
      notComparable,
      referenceAnalyzed: referenceGamesAnalyzed,
      conservationAnalyzed: conservationGamesAnalyzed,
    },
    totals: {
      reference: referenceTotals,
      conservation: conservationTotals,
      equalByPiece,
      allEqual: allTotalsEqual,
    },
    verified,
    mismatches,
    notComparableByReason,
    notComparableGames,
    identityConflicts,
    sample: {
      strategy: SAMPLE_STRATEGY,
      seed,
      requested: sampleSize,
      eligibleCandidates: sampleCandidates.length,
      actual: selectedSample.length,
      games: selectedSample,
    },
    performance: {
      durationMs,
      durationSeconds: round(durationMs / 1_000),
    },
    limitations: [
      "İki yöntem aynı chess.js PGN ayrıştırıcısını kullanır; ortak bir ayrıştırıcı hatasını bağımsız yakalayamaz.",
      "Sabit tohum aynı sabit veri kümesinde aynı örneği üretir; Chess.com geçmişi değişirse yeni bir corpus farklı örnek verebilir.",
    ],
  };

  await onProgress(progressEvent("auditCompleted"));
  return report;
}
