import { Chess } from "chess.js";
import { createCareerRecordsAccumulator } from "./career-records.js";

const PIECE_NAMES = Object.freeze({
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
});

const EMPTY_LOSSES = Object.freeze({
  total: 0,
  pawn: 0,
  knight: 0,
  bishop: 0,
  rook: 0,
  queen: 0,
});

export const COUNTING_ASSUMPTIONS = Object.freeze([
  "Yalnızca rules=chess olan standart oyunlar sayılır; Daily, Rapid, Blitz ve Bullet birlikte alınır.",
  "Bir taş, yakalandığı andaki türüyle sayılır; terfi etmiş bir piyon daha sonra vezir olarak alınırsa vezir kaybıdır.",
  "Yalnızca PGN'de gerçekten gerçekleşmiş almalar sayılır; terk, süre bitimi veya mat ek taş kaybı oluşturmaz.",
  "Şah hiçbir zaman kayıp taş toplamına katılmaz.",
]);

export class GameAnalysisError extends Error {
  constructor(reason, message, { variant, cause } = {}) {
    super(message, { cause });
    this.name = "GameAnalysisError";
    this.reason = reason;
    this.variant = variant;
  }
}

function emptyLosses() {
  return { ...EMPTY_LOSSES };
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLocaleLowerCase("en-US") : "";
}

function normalizeProfileUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/$/, "").toLocaleLowerCase("en-US");
}

function sideMatches(side, identity) {
  const sideUsername = normalizeUsername(side?.username);
  const sideProfileUrl = normalizeProfileUrl(side?.["@id"]);

  return (
    identity.usernames.has(sideUsername) ||
    (identity.profileUrl && sideProfileUrl === identity.profileUrl)
  );
}

function resolvePlayerColor(game, player) {
  const identity = {
    usernames: new Set(
      [player.requestedUsername, player.canonicalUsername]
        .map(normalizeUsername)
        .filter(Boolean),
    ),
    profileUrl: normalizeProfileUrl(player.profileUrl),
  };
  const isWhite = sideMatches(game.white, identity);
  const isBlack = sideMatches(game.black, identity);

  if (isWhite === isBlack) {
    throw new GameAnalysisError(
      "playerColorUnresolved",
      "Kullanıcının bu oyundaki rengi güvenilir biçimde belirlenemedi.",
    );
  }

  return isWhite ? "w" : "b";
}

function fenCore(fen) {
  if (typeof fen !== "string") {
    return null;
  }

  try {
    // Chess.com'un eski kayıtları, alma mümkün olmasa bile çift piyon
    // sürüşünden sonra en-passant hedefi yazabiliyor. chess.js iki biçimi
    // aynı kurallı konuma normalleştirir; gerçek tahta farkları korunur.
    return new Chess(fen).fen().split(/\s+/).slice(0, 4).join(" ");
  } catch {
    return null;
  }
}

function countNonKingPieces(fen, color) {
  const placement = fenCore(fen)?.split(" ")[0];

  if (!placement) {
    throw new GameAnalysisError("invalidFen", "Taş dizilimi FEN kaydından okunamadı.");
  }

  let count = 0;

  for (const symbol of placement) {
    if (!/[pnbrq]/i.test(symbol)) {
      continue;
    }

    const pieceColor = symbol === symbol.toUpperCase() ? "w" : "b";
    if (pieceColor === color) {
      count += 1;
    }
  }

  return count;
}

function addLoss(target, pieceCode) {
  const pieceName = PIECE_NAMES[pieceCode];

  if (!pieceName) {
    throw new GameAnalysisError("invalidCapture", "PGN kaydında beklenmeyen bir alma bulundu.");
  }

  target[pieceName] += 1;
  target.total += 1;
}

function userResultFromPgn(result, playerColor) {
  if (result === "1/2-1/2") {
    return "draw";
  }

  if (result === "1-0") {
    return playerColor === "w" ? "win" : "loss";
  }

  if (result === "0-1") {
    return playerColor === "b" ? "win" : "loss";
  }

  return "unknown";
}

export function analyzeGame(game, player) {
  const variant = typeof game.rules === "string" ? game.rules : "unknown";

  if (variant !== "chess") {
    throw new GameAnalysisError(
      "unsupportedVariant",
      `İlk prototip ${variant} oyun türünü işlemiyor.`,
      { variant },
    );
  }

  if (typeof game.pgn !== "string" || game.pgn.trim() === "") {
    throw new GameAnalysisError("missingPgn", "Oyunun PGN kaydı bulunmuyor.");
  }

  const playerColor = resolvePlayerColor(game, player);
  const chess = new Chess();

  try {
    chess.loadPgn(game.pgn);
  } catch (cause) {
    throw new GameAnalysisError("pgnParseError", "PGN kaydı ayrıştırılamadı.", { cause });
  }

  const pgnResult = chess.getHeaders().Result;
  if (pgnResult === "*") {
    throw new GameAnalysisError("unfinishedPgn", "PGN tamamlanmış bir oyun sonucu içermiyor.");
  }

  const calculatedFinalFen = chess.fen({ forceEnpassantSquare: true });
  const expectedFinalFen = fenCore(game.fen);

  if (!expectedFinalFen || fenCore(calculatedFinalFen) !== expectedFinalFen) {
    throw new GameAnalysisError(
      "finalPositionMismatch",
      "PGN son konumu Chess.com son konumuyla eşleşmiyor.",
    );
  }

  const moves = chess.history({ verbose: true });
  const losses = emptyLosses();

  for (const move of moves) {
    if (move.color !== playerColor && move.captured) {
      addLoss(losses, move.captured);
    }
  }

  const initialFen = moves[0]?.before ?? chess.getHeaders().FEN ?? new Chess().fen();
  const initialPieceCount = countNonKingPieces(initialFen, playerColor);
  const finalPieceCount = countNonKingPieces(calculatedFinalFen, playerColor);

  if (losses.total !== initialPieceCount - finalPieceCount) {
    throw new GameAnalysisError(
      "captureInvariantMismatch",
      "PGN alma sayısı başlangıç ve son taş envanteriyle uyuşmuyor.",
    );
  }

  return {
    playerColor: playerColor === "w" ? "white" : "black",
    userResult: userResultFromPgn(pgnResult, playerColor),
    plyCount: moves.length,
    losses,
  };
}

function increment(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}

export function createLossAccumulator(player) {
  const lostPieces = emptyLosses();
  const careerRecords = createCareerRecordsAccumulator();
  const skippedByReason = {};
  const skippedVariants = {};
  let uniqueGamesProcessed = 0;
  let gamesExamined = 0;

  return {
    addGame(game) {
      uniqueGamesProcessed += 1;

      try {
        const analysis = analyzeGame(game, player);
        careerRecords.addExaminedGame(game, analysis);

        for (const key of Object.keys(lostPieces)) {
          lostPieces[key] += analysis.losses[key];
        }

        gamesExamined += 1;
        return { status: "examined" };
      } catch (error) {
        if (!(error instanceof GameAnalysisError)) {
          throw error;
        }

        increment(skippedByReason, error.reason);
        if (error.reason === "unsupportedVariant") {
          increment(skippedVariants, error.variant ?? "unknown");
        }

        return { status: "skipped", reason: error.reason };
      }
    },

    snapshot() {
      return {
        uniqueGamesProcessed,
        gamesExamined,
        gamesSkipped: uniqueGamesProcessed - gamesExamined,
        lostPieces: { ...lostPieces },
        careerRecords: careerRecords.snapshot(),
        skippedByReason: { ...skippedByReason },
        skippedVariants: { ...skippedVariants },
      };
    },
  };
}

export function buildLossReport(recentGames) {
  const accumulator = createLossAccumulator(recentGames);

  for (const game of recentGames.games) {
    accumulator.addGame(game);
  }

  const summary = accumulator.snapshot();
  const latestEndTime = recentGames.games.reduce(
    (latest, game) => Math.max(latest, Number(game.end_time ?? 0)),
    0,
  );

  return {
    mode: "recent",
    username: recentGames.canonicalUsername,
    requestedGameLimit: recentGames.requestedLimit,
    recentGamesSelected: recentGames.games.length,
    ...summary,
    duplicateGameRecordsSkipped: recentGames.duplicateGamesSkipped ?? 0,
    source: {
      provider: "Chess.com PubAPI",
      archiveMonthsFetched: recentGames.archiveMonthsFetched,
      archiveGameRecordsReceived: recentGames.archiveGameRecordsReceived,
      latestSelectedGameEndedAt:
        latestEndTime > 0 ? new Date(latestEndTime * 1_000).toISOString() : null,
    },
    assumptions: [...COUNTING_ASSUMPTIONS],
  };
}
