import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Chess } from "chess.js";
import { analyzeGame } from "../src/lost-pieces.js";
import { analyzeGameByConservation } from "../audit/conservation-validator.js";

const PLAYER = {
  requestedUsername: "Hiy-Z",
  canonicalUsername: "Hiy-Z",
  profileUrl: "https://api.chess.com/pub/player/hiy-z",
};

function losses(overrides = {}) {
  return {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
    ...overrides,
  };
}

function buildPgn({
  moves,
  result,
  white = "Hiy-Z",
  black = "Opponent",
  initialFen,
  termination,
}) {
  const headers = [
    '[Event "Conservation fixture"]',
    '[Site "Chess.com"]',
    '[Date "2026.08.06"]',
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
  ];

  if (termination) {
    headers.push(`[Termination "${termination}"]`);
  }
  if (initialFen) {
    headers.push('[SetUp "1"]', `[FEN "${initialFen}"]`);
  }

  return `${headers.join("\n")}\n\n${moves} ${result}`;
}

function buildGame(fixture) {
  const pgn = buildPgn(fixture);
  const chess = new Chess();
  chess.loadPgn(pgn);
  assert.equal(chess.fen({ forceEnpassantSquare: true }), fixture.finalFen);

  const whiteIsPlayer = fixture.white !== "Opponent";
  return {
    rules: "chess",
    pgn,
    fen: fixture.finalFen,
    url: `https://www.chess.com/game/live/${fixture.slug}`,
    end_time: 1_754_435_200,
    white: {
      username: whiteIsPlayer ? "Hiy-Z" : "Opponent",
      "@id": whiteIsPlayer
        ? "https://api.chess.com/pub/player/hiy-z"
        : "https://api.chess.com/pub/player/opponent",
    },
    black: {
      username: whiteIsPlayer ? "Opponent" : "Hiy-Z",
      "@id": whiteIsPlayer
        ? "https://api.chess.com/pub/player/opponent"
        : "https://api.chess.com/pub/player/hiy-z",
    },
  };
}

const FIXTURES = [
  {
    name: "normal alma",
    slug: "normal-capture",
    moves: "1. e4 d5 2. exd5 Qxd5",
    result: "1/2-1/2",
    finalFen: "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3",
    expected: losses({ total: 1, pawn: 1 }),
  },
  {
    name: "geçerken alma",
    slug: "en-passant",
    moves: "1. a3 e5 2. h3 e4 3. d4 exd3",
    result: "1/2-1/2",
    finalFen: "rnbqkbnr/pppp1ppp/8/8/8/P2p3P/1PP1PPP1/RNBQKBNR w KQkq - 0 4",
    expected: losses({ total: 1, pawn: 1 }),
  },
  {
    name: "terfi eden taşın tahtada kalması",
    slug: "promotion-survives",
    initialFen: "7k/P7/8/8/8/8/7K/8 w - - 0 1",
    moves: "1. a8=Q+ Kh7",
    result: "1/2-1/2",
    finalFen: "Q7/7k/8/8/8/8/7K/8 w - - 1 2",
    expected: losses(),
    evidence: { promotion: "queen", initialPawn: 1, finalQueen: 1 },
  },
  {
    name: "terfi etmiş vezirin yakalanması",
    slug: "promoted-queen-captured",
    initialFen: "7k/P7/8/8/8/8/7K/8 w - - 0 1",
    moves: "1. a8=Q+ Kh7 2. Qh8+ Kxh8",
    result: "0-1",
    finalFen: "7k/8/8/8/8/8/7K/8 w - - 0 3",
    expected: losses({ total: 1, queen: 1 }),
    evidence: { promotion: "queen", initialPawn: 1, finalQueen: 0 },
  },
  {
    name: "alma ile ata terfi ve terfi taşının yakalanması",
    slug: "underpromotion-captured",
    initialFen: "1rk5/P7/8/8/8/8/7K/8 w - - 0 1",
    moves: "1. axb8=N Kxb8",
    result: "0-1",
    finalFen: "1k6/8/8/8/8/8/7K/8 w - - 0 2",
    expected: losses({ total: 1, knight: 1 }),
    evidence: { promotion: "knight", initialPawn: 1, finalKnight: 0 },
  },
  {
    name: "özel FEN'deki beş taş türünün kaybı",
    slug: "custom-fen-type-matrix",
    initialFen: "r6k/P7/N7/B7/R7/Q7/8/7K b - - 0 1",
    moves: "1... Rxa7 2. Kh2 Rxa6 3. Kh1 Rxa5 4. Kh2 Rxa4 5. Kh1 Rxa3",
    result: "0-1",
    finalFen: "7k/8/8/8/8/r7/8/7K w - - 0 6",
    expected: losses({ total: 5, pawn: 1, knight: 1, bishop: 1, rook: 1, queen: 1 }),
    customInventory: losses({ total: 5, pawn: 1, knight: 1, bishop: 1, rook: 1, queen: 1 }),
  },
  {
    name: "terk",
    slug: "resignation",
    white: "Opponent",
    black: "Hiy-Z",
    moves: "1. e4 d5 2. exd5",
    result: "1-0",
    termination: "Opponent won by resignation",
    finalFen: "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
    expected: losses({ total: 1, pawn: 1 }),
  },
  {
    name: "süre bitimi",
    slug: "timeout",
    moves: "1. e4 e5",
    result: "0-1",
    termination: "Opponent won on time",
    finalFen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    expected: losses(),
  },
  {
    name: "mat",
    slug: "checkmate",
    moves: "1. f3 e5 2. g4 Qh4#",
    result: "0-1",
    termination: "Opponent won by checkmate",
    finalFen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    expected: losses(),
    checkmate: true,
  },
];

test("korunum doğrulayıcısı üretim sayacını ve hamlenin capture/promotion alanlarını kullanmaz", () => {
  const source = readFileSync(
    new URL("../audit/conservation-validator.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from\s+["'][^"']*lost-pieces/);
  assert.doesNotMatch(source, /\.captured\b/);
  assert.doesNotMatch(source, /\.promotion\b/);
});

for (const fixture of FIXTURES) {
  test(`korunum denetimi: ${fixture.name}`, () => {
    const game = buildGame(fixture);
    const independent = analyzeGameByConservation(game, PLAYER);
    const reference = analyzeGame(game, PLAYER);

    assert.deepEqual(independent.losses, fixture.expected);
    assert.deepEqual(reference.losses, fixture.expected);
    assert.equal(independent.playerColor, reference.playerColor);

    if (fixture.evidence) {
      assert.equal(independent.inventory.promotions[fixture.evidence.promotion], 1);
      assert.equal(independent.inventory.initial.pawn, fixture.evidence.initialPawn);
      const finalPiece = fixture.evidence.promotion;
      assert.equal(
        independent.inventory.final[finalPiece],
        fixture.evidence[`final${finalPiece[0].toUpperCase()}${finalPiece.slice(1)}`],
      );
    }

    if (fixture.customInventory) {
      assert.deepEqual(independent.inventory.initial, fixture.customInventory);
    }

    if (fixture.checkmate) {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      assert.equal(chess.isCheckmate(), true);
    }
  });
}
