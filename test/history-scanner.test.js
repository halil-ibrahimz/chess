import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { ChessComApiError } from "../src/chess-com-client.js";
import { getGameIdentities, getGameIdentity } from "../src/game-identity.js";
import { scanAllHistory } from "../src/history-scanner.js";

const GAME_PGN = `[Event "Fixture"]
[Site "Chess.com"]
[Date "2026.08.05"]
[White "Hiy-Z"]
[Black "Opponent"]
[Result "1/2-1/2"]

1. e4 d5 2. exd5 Qxd5 1/2-1/2`;

const chess = new Chess();
chess.loadPgn(GAME_PGN);
const FINAL_FEN = chess.fen({ forceEnpassantSquare: true });

function game(uuid, endTime) {
  return {
    uuid,
    url: `https://www.chess.com/game/live/${uuid}`,
    end_time: endTime,
    rules: "chess",
    pgn: GAME_PGN,
    fen: FINAL_FEN,
    white: {
      username: "Hiy-Z",
      "@id": "https://api.chess.com/pub/player/hiy-z",
    },
    black: {
      username: "Opponent",
      "@id": "https://api.chess.com/pub/player/opponent",
    },
  };
}

test("tüm geçmişi kronolojik ve seri işler, tekrarları yalnız bir kez sayar", async () => {
  const firstGame = game("game-1", 10);
  const secondGame = game("game-2", 20);
  const monthlyCalls = [];
  const progressEvents = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  let clock = 0;
  let memoryTick = 0;
  const client = {
    async getPlayer() {
      return {
        username: "hiy-z",
        "@id": "https://api.chess.com/pub/player/hiy-z",
      };
    },
    async getArchiveUrls() {
      return [
        "https://api.chess.com/pub/player/hiy-z/games/2026/02",
        "https://api.chess.com/pub/player/hiy-z/games/2026/01",
      ];
    },
    async getMonthlyGames(_username, year, month) {
      monthlyCalls.push(`${year}/${month}`);
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;

      return month === "01"
        ? [firstGame]
        : [{ ...firstGame, uuid: undefined }, secondGame];
    },
  };

  const result = await scanAllHistory(client, "Hiy-Z", {
    onProgress: async (event) => progressEvents.push(event),
    nowImpl: () => {
      clock += 10;
      return clock;
    },
    memoryUsageImpl: () => {
      memoryTick += 1;
      return {
        rss: 50 * 1024 * 1024 + memoryTick * 1024,
        heapUsed: 20 * 1024 * 1024 + memoryTick * 1024,
      };
    },
  });

  assert.deepEqual(monthlyCalls, ["2026/01", "2026/02"]);
  assert.equal(maximumActiveRequests, 1);
  assert.equal(result.archiveMonthsFound, 2);
  assert.equal(result.archiveMonthsProcessed, 2);
  assert.equal(result.gameRecordsFound, 3);
  assert.equal(result.uniqueGamesProcessed, 2);
  assert.equal(result.gamesExamined, 2);
  assert.equal(result.gamesSkipped, 0);
  assert.equal(result.duplicateGameRecordsSkipped, 1);
  assert.equal(result.lostPieces.pawn, 2);
  assert.equal(result.lostPieces.total, 2);
  assert.deepEqual(result.careerRecords, {
    bloodiestWin: null,
    longestBattle: {
      url: "https://www.chess.com/game/live/game-2",
      opponent: { username: "Opponent", rating: null },
      playerColor: "white",
      endTime: 20,
      timeClass: null,
      timeControl: null,
      userResult: "draw",
      playerRawResult: null,
      opponentRawResult: null,
      moveCount: 2,
      plyCount: 4,
      lostPieces: {
        total: 1,
        pawn: 1,
        knight: 0,
        bishop: 0,
        rook: 0,
        queen: 0,
      },
    },
    fastestCheckmate: null,
    queenLossWins: 0,
    flawlessWins: 0,
  });
  assert.equal("games" in result, false);
  assert.equal(result.performance.memory.approximate, true);

  const completedMonths = progressEvents.filter(
    (event) => event.stage === "archiveCompleted",
  );
  assert.deepEqual(
    completedMonths.map((event) => event.archives.processed),
    [1, 2],
  );
  assert.ok(completedMonths.every((event) => event.archives.total === 2));
  assert.deepEqual(
    completedMonths.map((event) => event.games.examined),
    [1, 2],
  );
  assert.equal(progressEvents[progressEvents.length - 1].stage, "scanCompleted");
});

test("bir arşiv ayı alınamazsa sonraki aya geçmez ve eksik final üretmez", async () => {
  const monthlyCalls = [];
  const progressEvents = [];
  const client = {
    async getPlayer() {
      return { username: "hiy-z" };
    },
    async getArchiveUrls() {
      return [
        "https://api.chess.com/pub/player/hiy-z/games/2026/01",
        "https://api.chess.com/pub/player/hiy-z/games/2026/02",
        "https://api.chess.com/pub/player/hiy-z/games/2026/03",
      ];
    },
    async getMonthlyGames(_username, year, month) {
      monthlyCalls.push(`${year}/${month}`);
      if (month === "02") {
        throw new ChessComApiError("temporary failure", { code: "NETWORK_ERROR" });
      }

      return [];
    },
  };

  await assert.rejects(
    scanAllHistory(client, "Hiy-Z", {
      onProgress: async (event) => progressEvents.push(event),
    }),
    (error) => error instanceof ChessComApiError && error.code === "NETWORK_ERROR",
  );

  assert.deepEqual(monthlyCalls, ["2026/01", "2026/02"]);
  assert.equal(
    progressEvents.filter((event) => event.stage === "archiveCompleted").length,
    1,
  );
  assert.equal(progressEvents.some((event) => event.stage === "scanCompleted"), false);
});

test("oyun kimliği UUID, URL ve içerik parmak iziyle kararlı çalışır", async () => {
  assert.equal(await getGameIdentity({ uuid: "ABC" }), await getGameIdentity({ uuid: "abc" }));
  assert.equal(
    await getGameIdentity({ url: "https://www.chess.com/game/live/123/" }),
    await getGameIdentity({ url: "https://www.chess.com/game/live/123" }),
  );
  assert.equal(
    await getGameIdentity({ end_time: 1, pgn: "same" }),
    await getGameIdentity({ end_time: 1, pgn: "same" }),
  );
  assert.notEqual(
    await getGameIdentity({ end_time: 1, pgn: "first" }),
    await getGameIdentity({ end_time: 1, pgn: "second" }),
  );
  assert.deepEqual(
    (await getGameIdentities({
      uuid: "ABC",
      url: "https://www.chess.com/game/live/123",
      end_time: 1,
    })).map((identity) => identity.split(":", 1)[0]),
    ["uuid", "url", "sha256"],
  );
  assert.equal(
    await getGameIdentity({ end_time: 1, pgn: "same" }),
    "sha256:77523a3b04621cee1caa06e15e001c7196bb71f32a7fee5f76d14de68789434e",
  );
});

test("bellek API'si olmayan tarayıcı ortamını açıkça unavailable olarak raporlar", async () => {
  const client = {
    async getPlayer() {
      return { username: "hiy-z" };
    },
    async getArchiveUrls() {
      return [];
    },
  };

  const result = await scanAllHistory(client, "Hiy-Z", {
    memoryUsageImpl: () => null,
  });

  assert.deepEqual(result.performance.memory, {
    available: false,
    approximate: false,
    reason: "notAvailableInThisEnvironment",
  });
});

test("Node varsayılan adaptörü CLI bellek ölçümünü korur", async () => {
  const client = {
    async getPlayer() {
      return { username: "hiy-z" };
    },
    async getArchiveUrls() {
      return [];
    },
  };

  const result = await scanAllHistory(client, "Hiy-Z");

  assert.equal(result.performance.memory.available, true);
  assert.equal(result.performance.memory.approximate, true);
  assert.equal(typeof result.performance.memory.peakRssMiB, "number");
  assert.equal(typeof result.performance.memory.peakHeapUsedMiB, "number");
});
