import assert from "node:assert/strict";
import test from "node:test";
import {
  ChessComApiError,
  ChessComClient,
  createPlatformFetch,
  fetchRecentGames,
  validateGameLimit,
  validateUsername,
} from "../src/chess-com-client.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

test("son maçları ay sınırını aşarak en yeniden eskiye ve seri alır", async () => {
  const calls = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const responses = new Map([
    [
      "https://api.chess.com/pub/player/Hiy-Z",
      { username: "Hiy-Z", "@id": "https://api.chess.com/pub/player/hiy-z" },
    ],
    [
      "https://api.chess.com/pub/player/Hiy-Z/games/archives",
      {
        archives: [
          "https://api.chess.com/pub/player/hiy-z/games/2026/07",
          "https://api.chess.com/pub/player/hiy-z/games/2026/08",
        ],
      },
    ],
    [
      "https://api.chess.com/pub/player/Hiy-Z/games/2026/08",
      { games: [{ end_time: 30 }, { end_time: 40 }] },
    ],
    [
      "https://api.chess.com/pub/player/Hiy-Z/games/2026/07",
      { games: [{ end_time: 10 }, { end_time: 20 }] },
    ],
  ]);

  const fetchImpl = async (url) => {
    calls.push(url);
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await Promise.resolve();
    activeRequests -= 1;
    return jsonResponse(responses.get(url));
  };
  const client = new ChessComClient({ fetchImpl });
  const result = await fetchRecentGames(client, "Hiy-Z", 3);

  assert.deepEqual(
    result.games.map((game) => game.end_time),
    [40, 30, 20],
  );
  assert.equal(result.archiveMonthsFetched, 2);
  assert.equal(result.archiveGameRecordsReceived, 4);
  assert.equal(maximumActiveRequests, 1);
  assert.deepEqual(calls, [
    "https://api.chess.com/pub/player/Hiy-Z",
    "https://api.chess.com/pub/player/Hiy-Z/games/archives",
    "https://api.chess.com/pub/player/Hiy-Z/games/2026/08",
    "https://api.chess.com/pub/player/Hiy-Z/games/2026/07",
  ]);
});

test("beklenmeyen arşiv sunucusunu reddeder", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/player/Hiy-Z")) {
      return jsonResponse({
        username: "Hiy-Z",
        "@id": "https://api.chess.com/pub/player/hiy-z",
      });
    }

    return jsonResponse({ archives: ["https://example.com/games/2026/08"] });
  };
  const client = new ChessComClient({ fetchImpl });

  await assert.rejects(
    fetchRecentGames(client, "Hiy-Z", 1),
    (error) => error instanceof ChessComApiError && error.code === "INVALID_RESPONSE",
  );
});

test("404 yanıtını anlamlı API hatasına dönüştürür", async () => {
  const client = new ChessComClient({ fetchImpl: async () => jsonResponse({}, 404) });

  await assert.rejects(
    client.getPlayer("missing-user"),
    (error) =>
      error instanceof ChessComApiError && error.code === "NOT_FOUND" && error.status === 404,
  );
});

test("kullanıcı adı ve limit girdilerini sınırlar", () => {
  assert.equal(validateUsername("  Hiy-Z  "), "Hiy-Z");
  assert.equal(validateGameLimit("10"), 10);
  assert.throws(() => validateUsername("../secret"), TypeError);
  assert.throws(() => validateGameLimit(101), TypeError);
});

test("Node isteğinde User-Agent korur, tarayıcı modunda yasak başlığı göndermez", async () => {
  const observedHeaders = [];
  const fetchImpl = async (_url, options) => {
    observedHeaders.push(options.headers);
    return jsonResponse({ username: "Hiy-Z" });
  };

  await new ChessComClient({ fetchImpl, contact: "test@example.com" }).getPlayer("Hiy-Z");
  await new ChessComClient({ fetchImpl, sendUserAgent: false }).getPlayer("Hiy-Z");

  assert.match(observedHeaders[0]["User-Agent"], /contact: test@example\.com/);
  assert.equal(observedHeaders[0].Accept, "application/json");
  assert.deepEqual(observedHeaders[1], { Accept: "application/json" });
});

test("platform fetch metodunu ait olduğu çalışma alanına bağlar", async () => {
  const calls = [];
  const fetchScope = {
    async fetch(url, options) {
      if (this !== fetchScope) {
        throw new TypeError("Illegal invocation");
      }

      calls.push({ url, options });
      return jsonResponse({ username: "Hiy-Z" });
    },
  };
  const client = new ChessComClient({
    fetchImpl: createPlatformFetch(fetchScope),
    sendUserAgent: false,
  });

  const player = await client.getPlayer("Hiy-Z");

  assert.equal(player.username, "Hiy-Z");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.chess.com/pub/player/Hiy-Z");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json" });
});

test("Illegal invocation hatasını yeniden denemeden istek bağlamıyla iletir", async () => {
  const invocationCause = new TypeError("Illegal invocation");
  let attempts = 0;
  const client = new ChessComClient({
    fetchImpl() {
      attempts += 1;
      throw invocationCause;
    },
    sleepImpl: async () => assert.fail("Illegal invocation yeniden denenmemeli"),
  });

  await assert.rejects(client.getPlayer("Hiy-Z"), (error) => {
    assert.ok(error instanceof ChessComApiError);
    assert.equal(error.name, "ChessComApiError");
    assert.equal(error.code, "FETCH_INVOCATION_ERROR");
    assert.equal(typeof error.message, "string");
    assert.ok(error.message.length > 0);
    assert.equal(error.stage, "profile");
    assert.equal(error.requestUrl, "https://api.chess.com/pub/player/Hiy-Z");
    assert.equal(error.requestPath, "/player/Hiy-Z");
    assert.equal(Object.hasOwn(error, "status"), true);
    assert.equal(Object.hasOwn(error, "archive"), true);
    assert.equal(error.cause, invocationCause);
    return true;
  });

  assert.equal(attempts, 1);
});

test("son maç modunda yinelenen maçı limite ve sayıma iki kez katmaz", async () => {
  const duplicate = {
    uuid: "same-game",
    url: "https://www.chess.com/game/live/same-game",
    end_time: 20,
  };
  const fetchImpl = async (url) => {
    if (url.endsWith("/player/Hiy-Z")) {
      return jsonResponse({
        username: "Hiy-Z",
        "@id": "https://api.chess.com/pub/player/hiy-z",
      });
    }

    if (url.endsWith("/games/archives")) {
      return jsonResponse({
        archives: ["https://api.chess.com/pub/player/hiy-z/games/2026/08"],
      });
    }

    return jsonResponse({
      games: [
        { uuid: "older-game", end_time: 10 },
        duplicate,
        { url: duplicate.url, end_time: duplicate.end_time },
      ],
    });
  };
  const result = await fetchRecentGames(new ChessComClient({ fetchImpl }), "Hiy-Z", 2);

  assert.deepEqual(result.games.map((game) => game.end_time), [20, 10]);
  assert.equal(result.duplicateGamesSkipped, 1);
});

test("429 yanıtında Retry-After süresine uyar ve sonra başarıyla devam eder", async () => {
  let attempts = 0;
  const sleeps = [];
  const retryEvents = [];
  const client = new ChessComClient({
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({}, 429, { "Retry-After": "7" })
        : jsonResponse({ username: "Hiy-Z" });
    },
    sleepImpl: async (delayMs) => sleeps.push(delayMs),
    randomImpl: () => 0,
    onRetry: async (event) => retryEvents.push(event),
  });

  const player = await client.getPlayer("Hiy-Z");

  assert.equal(player.username, "Hiy-Z");
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [7_000]);
  assert.equal(retryEvents[0].reason, "rateLimited");
  assert.equal(retryEvents[0].nextAttempt, 2);
});

test("HTTP-date biçimindeki Retry-After değerinden önce yeniden istemez", async () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  let attempts = 0;
  const sleeps = [];
  const client = new ChessComClient({
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({}, 503, {
            "Retry-After": new Date(now + 9_000).toUTCString(),
          })
        : jsonResponse({ username: "Hiy-Z" });
    },
    nowImpl: () => now,
    sleepImpl: async (delayMs) => sleeps.push(delayMs),
    randomImpl: () => 0,
  });

  await client.getPlayer("Hiy-Z");

  assert.deepEqual(sleeps, [9_000]);
});

test("geçici bağlantı hatasında üstel bekleme sonrası yeniden dener", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new ChessComClient({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError("temporary connection failure");
      }

      return jsonResponse({ username: "Hiy-Z" });
    },
    retryBaseDelayMs: 25,
    sleepImpl: async (delayMs) => sleeps.push(delayMs),
    randomImpl: () => 0,
  });

  await client.getPlayer("Hiy-Z");

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [25]);
});

test("HTTP 200 gövde okuması koparsa aynı profil isteğini güvenli biçimde yeniden dener", async () => {
  const requestUrl = "https://api.chess.com/pub/player/Hiy-Z";
  const requestedUrls = [];
  const sleeps = [];
  const retryEvents = [];
  let attempts = 0;
  const client = new ChessComClient({
    fetchImpl: async (url) => {
      attempts += 1;
      requestedUrls.push(url);

      if (attempts === 1) {
        const response = jsonResponse({ username: "ignored" });
        response.json = async () => {
          throw new TypeError("terminated");
        };
        return response;
      }

      return jsonResponse({ username: "Hiy-Z" });
    },
    retryBaseDelayMs: 25,
    sleepImpl: async (delayMs) => sleeps.push(delayMs),
    randomImpl: () => 0,
    onRetry: async (event) => retryEvents.push(event),
  });

  const profile = await client.getPlayer("Hiy-Z");

  assert.equal(profile.username, "Hiy-Z");
  assert.equal(attempts, 2);
  assert.deepEqual(requestedUrls, [requestUrl, requestUrl]);
  assert.deepEqual(sleeps, [25]);
  assert.equal(retryEvents.length, 1);
  assert.equal(retryEvents[0].stage, "profile");
  assert.equal(retryEvents[0].reason, "network");
  assert.equal(retryEvents[0].status, null);
  assert.equal(retryEvents[0].requestUrl, requestUrl);
});

test("410 kalıcı hatasını yeniden denemez", async () => {
  let attempts = 0;
  const client = new ChessComClient({
    fetchImpl: async () => {
      attempts += 1;
      return jsonResponse({}, 410);
    },
    sleepImpl: async () => assert.fail("410 için bekleme yapılmamalı"),
  });

  await assert.rejects(
    client.getPlayer("Hiy-Z"),
    (error) => error instanceof ChessComApiError && error.code === "GONE",
  );
  assert.equal(attempts, 1);
});

test("geçici sunucu hatası retry bütçesi bitince mevcut HTTP hatasını korur", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new ChessComClient({
    fetchImpl: async () => {
      attempts += 1;
      return jsonResponse({}, 503);
    },
    maxRetries: 3,
    retryBaseDelayMs: 10,
    sleepImpl: async (delayMs) => sleeps.push(delayMs),
    randomImpl: () => 0,
  });

  await assert.rejects(
    client.getPlayer("Hiy-Z"),
    (error) =>
      error instanceof ChessComApiError && error.code === "HTTP_ERROR" && error.status === 503,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(sleeps, [10, 20, 40]);
});
