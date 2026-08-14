import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { analyzeGame, buildLossReport, GameAnalysisError } from "../src/lost-pieces.js";

const PLAYER = {
  requestedUsername: "Hiy-Z",
  canonicalUsername: "Hiy-Z",
  profileUrl: "https://api.chess.com/pub/player/hiy-z",
};

function pgn({
  moves,
  white = "Hiy-Z",
  black = "Opponent",
  result = "1/2-1/2",
  initialFen,
}) {
  const setup = initialFen ? `[SetUp "1"]\n[FEN "${initialFen}"]\n` : "";

  return `[Event "Fixture"]
[Site "Chess.com"]
[Date "2026.08.05"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]
${setup}
${moves} ${result}`;
}

function gameFromPgn(pgnText, overrides = {}) {
  const chess = new Chess();
  chess.loadPgn(pgnText);

  return {
    rules: "chess",
    pgn: pgnText,
    fen: chess.fen({ forceEnpassantSquare: true }),
    white: {
      username: "Hiy-Z",
      "@id": "https://api.chess.com/pub/player/hiy-z",
    },
    black: {
      username: "Opponent",
      "@id": "https://api.chess.com/pub/player/opponent",
    },
    end_time: 1_754_330_400,
    ...overrides,
  };
}

test("kullanıcı beyazken yalnızca beyazın kayıplarını sayar", () => {
  const fixture = gameFromPgn(pgn({ moves: "1. e4 d5 2. exd5 Qxd5" }));
  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.playerColor, "white");
  assert.deepEqual(result.losses, {
    total: 1,
    pawn: 1,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
  });
});

test("kullanıcı siyahken yalnızca siyahın kayıplarını sayar", () => {
  const fixture = gameFromPgn(
    pgn({ white: "Opponent", black: "HIY-z", moves: "1. e4 d5 2. exd5 Qxd5" }),
    {
      white: {
        username: "Opponent",
        "@id": "https://api.chess.com/pub/player/opponent",
      },
      black: {
        username: "HIY-z",
        "@id": "https://api.chess.com/pub/player/hiy-z/",
      },
    },
  );
  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.playerColor, "black");
  assert.equal(result.losses.pawn, 1);
  assert.equal(result.losses.total, 1);
});

test("geçerken alınan piyonu kayıp sayar", () => {
  const fixture = gameFromPgn(
    pgn({ moves: "1. a3 e5 2. h3 e4 3. d4 exd3" }),
  );
  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.losses.pawn, 1);
  assert.equal(result.losses.total, 1);
});

test("terfi etmiş taş yakalandığı türle sayılır", () => {
  const initialFen = "7k/P7/8/8/8/8/7K/8 w - - 0 1";
  const fixture = gameFromPgn(
    pgn({ initialFen, moves: "1. a8=Q+ Kh7 2. Qh8+ Kxh8" }),
  );
  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.losses.queen, 1);
  assert.equal(result.losses.pawn, 0);
  assert.equal(result.losses.total, 1);
});

test("terfi hamlesindeki alma rakibin doğru taş türüne yazılır", () => {
  const initialFen = "1r5k/P7/8/8/8/8/7K/8 w - - 0 1";
  const fixture = gameFromPgn(
    pgn({ initialFen, white: "Opponent", black: "Hiy-Z", moves: "1. axb8=Q+", result: "1-0" }),
    {
      white: {
        username: "Opponent",
        "@id": "https://api.chess.com/pub/player/opponent",
      },
      black: {
        username: "Hiy-Z",
        "@id": "https://api.chess.com/pub/player/hiy-z",
      },
    },
  );
  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.losses.rook, 1);
  assert.equal(result.losses.total, 1);
});

test("terk edilmiş oyunda tahtada kalan tehditleri kayıp varsaymaz", () => {
  const fixture = gameFromPgn(pgn({ moves: "1. e4 e5", result: "0-1" }));
  const result = analyzeGame(fixture, PLAYER);

  assert.deepEqual(result.losses, {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
  });
});

test("API son FEN'i uyuşmazsa oyunu reddeder", () => {
  const fixture = gameFromPgn(pgn({ moves: "1. e4 e5" }), {
    fen: new Chess().fen(),
  });

  assert.throws(
    () => analyzeGame(fixture, PLAYER),
    (error) => error instanceof GameAnalysisError && error.reason === "finalPositionMismatch",
  );
});

test("eski Chess.com FEN'indeki etkisiz en-passant hedefini normalleştirir", () => {
  const fixture = gameFromPgn(pgn({ moves: "1. e4 e5" }));
  const fenFields = fixture.fen.split(" ");
  fenFields[3] = "e6";
  fixture.fen = fenFields.join(" ");

  const result = analyzeGame(fixture, PLAYER);

  assert.equal(result.losses.total, 0);
});

test("tamamlanmamış PGN'i reddeder", () => {
  const fixture = gameFromPgn(pgn({ moves: "1. e4 e5", result: "*" }));

  assert.throws(
    () => analyzeGame(fixture, PLAYER),
    (error) => error instanceof GameAnalysisError && error.reason === "unfinishedPgn",
  );
});

test("varyantı atlar ve geçerli oyun sayımını atomik toplar", () => {
  const valid = gameFromPgn(pgn({ moves: "1. e4 d5 2. exd5 Qxd5" }));
  const broken = { ...valid, fen: new Chess().fen() };
  const variant = { ...valid, rules: "crazyhouse" };
  const report = buildLossReport({
    ...PLAYER,
    requestedLimit: 3,
    games: [valid, broken, variant],
    archiveMonthsFetched: 1,
    archiveGameRecordsReceived: 3,
  });

  assert.equal(report.gamesExamined, 1);
  assert.equal(report.gamesSkipped, 2);
  assert.equal(report.lostPieces.pawn, 1);
  assert.equal(report.lostPieces.total, 1);
  assert.deepEqual(report.skippedByReason, {
    finalPositionMismatch: 1,
    unsupportedVariant: 1,
  });
  assert.deepEqual(report.skippedVariants, { crazyhouse: 1 });
});
