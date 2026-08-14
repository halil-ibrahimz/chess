import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { scanAllHistory } from "../src/history-scanner.js";
import { sha256Hex, sha256HexFallback } from "../src/sha256.js";

const KNOWN_VECTORS = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
];

const GAME_PGN = `[Event "Fallback fixture"]
[Site "Chess.com"]
[Date "2026.08.10"]
[White "Hiy-Z"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

function fallbackGame() {
  const chess = new Chess();
  chess.loadPgn(GAME_PGN);

  return {
    url: "https://www.chess.com/game/live/fallback-fixture",
    end_time: 1_786_315_200,
    rules: "chess",
    pgn: GAME_PGN,
    fen: chess.fen({ forceEnpassantSquare: true }),
    white: {
      username: "Hiy-Z",
      result: "win",
    },
    black: {
      username: "Opponent",
      result: "resigned",
    },
  };
}

test("saf JavaScript SHA-256 bilinen metin vektörlerini üretir", () => {
  for (const [input, expected] of KNOWN_VECTORS) {
    assert.equal(sha256HexFallback(input), expected);
  }
});

test("Web Crypto ve saf JavaScript SHA-256 aynı küçük harfli hex çıktıyı üretir", async () => {
  assert.ok(globalThis.crypto?.subtle, "Bu karşılaştırma için Web Crypto gerekli.");

  for (const [input] of [...KNOWN_VECTORS, ["Düşen Taşlar — Hiy-Z"]]) {
    const webCryptoResult = await sha256Hex(input);
    assert.equal(webCryptoResult, sha256HexFallback(input));
    assert.match(webCryptoResult, /^[0-9a-f]{64}$/);
  }
});

test("crypto.subtle olmadan bir oyunlu tüm geçmiş taraması fallback ile tamamlanır", async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });

  try {
    const result = await scanAllHistory({
      async getPlayer() {
        return { username: "hiy-z" };
      },
      async getArchiveUrls() {
        return ["https://api.chess.com/pub/player/hiy-z/games/2026/08"];
      },
      async getMonthlyGames() {
        return [fallbackGame(), fallbackGame()];
      },
    }, "Hiy-Z");

    assert.equal(result.gameRecordsFound, 2);
    assert.equal(result.uniqueGamesProcessed, 1);
    assert.equal(result.gamesExamined, 1);
    assert.equal(result.duplicateGameRecordsSkipped, 1);
  } finally {
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    } else {
      delete globalThis.crypto;
    }
  }
});
