import assert from "node:assert/strict";
import test from "node:test";
import {
  RESULT_CACHE_TTL_MS,
  readCachedResult,
  writeCachedResult,
} from "../src/web/result-cache.js";
import {
  createHistoryWorkerController,
  serializeWorkerError,
} from "../src/web/worker-controller.js";

function resultFixture() {
  return {
    username: "hiy-z",
    uniqueGamesProcessed: 2,
    gamesExamined: 2,
    gamesSkipped: 0,
    lostPieces: {
      total: 7,
      pawn: 3,
      knight: 1,
      bishop: 1,
      rook: 1,
      queen: 1,
    },
  };
}

function careerRecordsFixture() {
  return {
    bloodiestWin: {
      url: "https://www.chess.com/game/live/record",
      opponent: { username: "Opponent", rating: 1_650 },
      playerColor: "white",
      endTime: 1_754_330_400,
      timeClass: "rapid",
      timeControl: "600",
      userResult: "win",
      playerRawResult: "win",
      opponentRawResult: "resigned",
      moveCount: 12,
      plyCount: 23,
      lostPieces: {
        total: 7,
        pawn: 3,
        knight: 1,
        bishop: 1,
        rook: 1,
        queen: 1,
      },
    },
    longestBattle: null,
    fastestCheckmate: null,
    queenLossWins: 1,
    flawlessWins: 0,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

test("tamamlanan web sonucu kullanıcı adına göre altı saat saklanır", () => {
  const storage = memoryStorage();
  const now = 1_000;
  const result = resultFixture();

  assert.equal(writeCachedResult(storage, " Hiy-Z ", result, now), true);
  assert.deepEqual(readCachedResult(storage, "hiy-z", now + 1), {
    version: 1,
    savedAt: now,
    expiresAt: now + RESULT_CACHE_TTL_MS,
    result,
  });
});

test("süresi dolmuş veya bozuk web önbelleği kullanılmaz ve temizlenir", () => {
  const storage = memoryStorage();
  const now = 5_000;
  writeCachedResult(storage, "Hiy-Z", resultFixture(), now, 10);

  assert.equal(readCachedResult(storage, "Hiy-Z", now + 10), null);
  assert.equal(storage.values.size, 0);

  storage.setItem("satranc-mezarligi:history-result:hiy-z", "{bozuk");
  assert.equal(readCachedResult(storage, "Hiy-Z", now), null);
  assert.equal(storage.values.size, 0);
});

test("yeni kariyer kayıtlarını ve fastestCheckmate alanı olmayan eski cache'i kabul eder", () => {
  const storage = memoryStorage();
  const now = 7_000;
  const legacyResult = {
    ...resultFixture(),
    careerRecords: {
      bloodiestWin: null,
      longestBattle: null,
      shortestWin: null,
      queenLossWins: 0,
      flawlessWins: 0,
    },
  };
  const currentResult = {
    ...resultFixture(),
    displayUsername: "UgurCelik24",
    careerRecords: careerRecordsFixture(),
  };

  assert.equal(writeCachedResult(storage, "legacy-user", legacyResult, now), true);
  const cachedLegacyResult = readCachedResult(storage, "legacy-user", now + 1)?.result;
  assert.deepEqual(cachedLegacyResult, legacyResult);
  assert.equal(
    Object.hasOwn(cachedLegacyResult.careerRecords, "fastestCheckmate"),
    false,
  );

  assert.equal(writeCachedResult(storage, "current-user", currentResult, now), true);
  const cachedCurrentResult = readCachedResult(storage, "CURRENT-USER", now + 1)?.result;
  assert.deepEqual(cachedCurrentResult, currentResult);
  assert.equal(cachedCurrentResult.displayUsername, "UgurCelik24");
});

test("Worker denetleyicisi gerçek ilerleme olaylarını ve final sonucu ayrı iletir", async () => {
  const messages = [];
  const result = {
    ...resultFixture(),
    username: "Hiy-Z",
    careerRecords: careerRecordsFixture(),
  };
  const scanId = "scan-progress";
  let retryCallback;
  const client = { id: "client" };
  const controller = createHistoryWorkerController({
    postMessage: (message) => messages.push(message),
    createClient(options) {
      retryCallback = options.onRetry;
      return client;
    },
    async scanHistory(receivedClient, username, { onProgress }) {
      assert.equal(receivedClient, client);
      assert.equal(username, "hiy-z");
      await retryCallback({ type: "retry", delayMs: 5_000 });
      await onProgress({
        type: "historyProgress",
        stage: "archiveCompleted",
        archives: { processed: 1, total: 2 },
      });
      return result;
    },
  });

  await controller.handleMessage({ type: "start", scanId, username: "hiy-z" });

  assert.deepEqual(messages, [
    { type: "progress", scanId, event: { type: "retry", delayMs: 5_000 } },
    {
      type: "progress",
      scanId,
      event: {
        type: "historyProgress",
        stage: "archiveCompleted",
        archives: { processed: 1, total: 2 },
      },
    },
    { type: "result", scanId, result: { ...result, displayUsername: "Hiy-Z" } },
  ]);
});

test("Worker hatası yapılandırılmış mesaja dönüşür", async () => {
  const messages = [];
  const invocationCause = new TypeError("Illegal invocation");
  const error = Object.assign(new Error("Geçici hata"), {
    name: "ChessComApiError",
    code: "NETWORK_ERROR",
    status: 503,
    stage: "archiveMonth",
    requestUrl: "https://api.chess.com/pub/player/Hiy-Z/games/2026/08",
    requestPath: "/player/Hiy-Z/games/2026/08",
    archive: "2026/08",
    cause: invocationCause,
  });
  const controller = createHistoryWorkerController({
    postMessage: (message) => messages.push(message),
    createClient: () => ({}),
    scanHistory: async () => {
      throw error;
    },
  });

  await controller.handleMessage({
    type: "start",
    scanId: "scan-error",
    username: "Hiy-Z",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.equal(messages[0].scanId, "scan-error");
  assert.deepEqual(
    {
      name: messages[0].error.name,
      code: messages[0].error.code,
      message: messages[0].error.message,
      status: messages[0].error.status,
      stage: messages[0].error.stage,
      requestUrl: messages[0].error.requestUrl,
      requestPath: messages[0].error.requestPath,
      archive: messages[0].error.archive,
      causeName: messages[0].error.causeName,
      causeMessage: messages[0].error.causeMessage,
    },
    {
      name: "ChessComApiError",
      code: "NETWORK_ERROR",
      message: "Geçici hata",
      status: 503,
      stage: "archiveMonth",
      requestUrl: "https://api.chess.com/pub/player/Hiy-Z/games/2026/08",
      requestPath: "/player/Hiy-Z/games/2026/08",
      archive: "2026/08",
      causeName: "TypeError",
      causeMessage: "Illegal invocation",
    },
  );
  assert.equal(typeof messages[0].error.stack, "string");
  assert.deepEqual(serializeWorkerError(null), {
    name: "Error",
    code: "SCAN_FAILED",
    message: "Tarama tamamlanamadı.",
    status: null,
    stage: null,
    requestUrl: null,
    requestPath: null,
    archive: null,
    causeName: null,
    causeMessage: null,
    stack: null,
  });
});

test("aynı Worker ikinci eşzamanlı taramayı başlatmaz", async () => {
  const messages = [];
  let releaseScan;
  const pendingScan = new Promise((resolve) => {
    releaseScan = () => resolve(resultFixture());
  });
  const controller = createHistoryWorkerController({
    postMessage: (message) => messages.push(message),
    createClient: () => ({}),
    scanHistory: () => pendingScan,
  });

  const firstScan = controller.handleMessage({
    type: "start",
    scanId: "scan-first",
    username: "first",
  });
  await Promise.resolve();
  await controller.handleMessage({
    type: "start",
    scanId: "scan-second",
    username: "second",
  });
  releaseScan();
  await firstScan;

  assert.equal(messages[0].type, "error");
  assert.equal(messages[0].scanId, "scan-second");
  assert.equal(messages[0].error.code, "SCAN_ALREADY_RUNNING");
  assert.equal(messages[1].type, "result");
  assert.equal(messages[1].scanId, "scan-first");
});
