const LOSS_KEYS = Object.freeze([
  "total",
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
]);

function textOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneLosses(losses) {
  return Object.fromEntries(
    LOSS_KEYS.map((key) => [
      key,
      Number.isInteger(losses?.[key]) && losses[key] >= 0 ? losses[key] : 0,
    ]),
  );
}

function stableGameKey(game) {
  const url = textOrNull(game?.url)?.toLocaleLowerCase("en-US");
  if (url) {
    return `url:${url.replace(/\/$/, "")}`;
  }

  const uuid = textOrNull(game?.uuid)?.toLocaleLowerCase("en-US");
  if (uuid) {
    return `uuid:${uuid}`;
  }

  return `fallback:${JSON.stringify([
    numberOrNull(game?.end_time),
    textOrNull(game?.white?.username)?.toLocaleLowerCase("en-US") ?? null,
    textOrNull(game?.black?.username)?.toLocaleLowerCase("en-US") ?? null,
    textOrNull(game?.time_class)?.toLocaleLowerCase("en-US") ?? null,
    textOrNull(game?.time_control)?.toLocaleLowerCase("en-US") ?? null,
    textOrNull(game?.fen) ?? null,
  ])}`;
}

function normalizedUserResult(analysis, playerRawResult, opponentRawResult) {
  if (["win", "loss", "draw"].includes(analysis?.userResult)) {
    return analysis.userResult;
  }

  if (playerRawResult === "win") {
    return "win";
  }

  if (opponentRawResult === "win") {
    return "loss";
  }

  return playerRawResult && opponentRawResult ? "draw" : "unknown";
}

function createCandidate(game, analysis) {
  const playerColor = analysis?.playerColor === "black" ? "black" : "white";
  const opponentColor = playerColor === "white" ? "black" : "white";
  const playerSide = game?.[playerColor];
  const opponentSide = game?.[opponentColor];
  const playerRawResult = textOrNull(playerSide?.result)?.toLocaleLowerCase("en-US") ?? null;
  const opponentRawResult =
    textOrNull(opponentSide?.result)?.toLocaleLowerCase("en-US") ?? null;
  const plyCount = Number.isInteger(analysis?.plyCount) && analysis.plyCount >= 0
    ? analysis.plyCount
    : 0;

  return {
    tieKey: stableGameKey(game),
    record: {
      url: textOrNull(game?.url),
      opponent: {
        username: textOrNull(opponentSide?.username),
        rating: numberOrNull(opponentSide?.rating),
      },
      playerColor,
      endTime: numberOrNull(game?.end_time),
      timeClass: textOrNull(game?.time_class),
      timeControl: textOrNull(game?.time_control),
      userResult: normalizedUserResult(analysis, playerRawResult, opponentRawResult),
      playerRawResult,
      opponentRawResult,
      moveCount: Math.ceil(plyCount / 2),
      plyCount,
      lostPieces: cloneLosses(analysis?.losses),
    },
  };
}

function winsTie(candidate, current) {
  const candidateEndTime = candidate.record.endTime ?? Number.NEGATIVE_INFINITY;
  const currentEndTime = current.record.endTime ?? Number.NEGATIVE_INFINITY;

  if (candidateEndTime !== currentEndTime) {
    return candidateEndTime > currentEndTime;
  }

  return candidate.tieKey < current.tieKey;
}

function selectCandidate(current, candidate, comparePrimary) {
  if (!current) {
    return candidate;
  }

  const primaryComparison = comparePrimary(candidate.record, current.record);
  if (primaryComparison !== 0) {
    return primaryComparison > 0 ? candidate : current;
  }

  return winsTie(candidate, current) ? candidate : current;
}

function cloneRecord(candidate) {
  if (!candidate) {
    return null;
  }

  return {
    ...candidate.record,
    opponent: { ...candidate.record.opponent },
    lostPieces: { ...candidate.record.lostPieces },
  };
}

export function createCareerRecordsAccumulator() {
  let bloodiestWin = null;
  let longestBattle = null;
  let fastestCheckmate = null;
  let queenLossWins = 0;
  let flawlessWins = 0;

  return {
    addExaminedGame(game, analysis) {
      const candidate = createCandidate(game, analysis);
      const { record } = candidate;

      longestBattle = selectCandidate(
        longestBattle,
        candidate,
        (next, current) => next.plyCount - current.plyCount,
      );

      if (record.userResult !== "win") {
        return;
      }

      bloodiestWin = selectCandidate(
        bloodiestWin,
        candidate,
        (next, current) => next.lostPieces.total - current.lostPieces.total,
      );

      if (record.opponentRawResult === "checkmated") {
        fastestCheckmate = selectCandidate(
          fastestCheckmate,
          candidate,
          (next, current) => current.plyCount - next.plyCount,
        );
      }

      if (record.lostPieces.queen > 0) {
        queenLossWins += 1;
      }

      if (record.lostPieces.total === 0) {
        flawlessWins += 1;
      }
    },

    snapshot() {
      return {
        bloodiestWin: cloneRecord(bloodiestWin),
        longestBattle: cloneRecord(longestBattle),
        fastestCheckmate: cloneRecord(fastestCheckmate),
        queenLossWins,
        flawlessWins,
      };
    },
  };
}
