import { getGameIdentities } from "./game-identity.js";

const DEFAULT_BASE_URL = "https://api.chess.com/pub";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const MIN_RATE_LIMIT_DELAY_MS = 5_000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeRuntime() {
  return globalThis.process?.release?.name === "node";
}

function defaultContact() {
  return isNodeRuntime() ? globalThis.process.env?.CHESS_COM_CONTACT : undefined;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfter(response, nowMilliseconds) {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) {
    return 0;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMilliseconds) : 0;
}

function isFetchInvocationError(cause) {
  return cause instanceof TypeError
    && /illegal invocation|incompatible receiver|WorkerGlobalScope/i.test(cause.message);
}

function isTransientBodyReadError(cause) {
  return cause instanceof TypeError
    || cause?.name === "TimeoutError"
    || cause?.name === "AbortError";
}

function connectionError(cause, requestContext) {
  const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
  const invocationFailed = isFetchInvocationError(cause);
  const code = timedOut
    ? "TIMEOUT"
    : invocationFailed
      ? "FETCH_INVOCATION_ERROR"
      : "NETWORK_ERROR";
  const message = timedOut
    ? "Chess.com isteği zaman aşımına uğradı."
    : invocationFailed
      ? "Tarayıcı Chess.com isteğini başlatamadı."
      : "Chess.com bağlantısı kurulamadı.";

  return new ChessComApiError(message, { code, cause, ...requestContext });
}

export class ChessComApiError extends Error {
  constructor(
    message,
    {
      code = "CHESS_COM_API_ERROR",
      status,
      cause,
      stage,
      requestUrl,
      requestPath,
      archive,
    } = {},
  ) {
    super(message, { cause });
    this.name = "ChessComApiError";
    this.code = code;
    this.status = status;
    this.stage = stage;
    this.requestUrl = requestUrl;
    this.requestPath = requestPath;
    this.archive = archive;
  }
}

export function createPlatformFetch(fetchScope = globalThis) {
  const fetchImpl = fetchScope?.fetch;
  return typeof fetchImpl === "function" ? fetchImpl.bind(fetchScope) : fetchImpl;
}

export function validateUsername(value) {
  if (typeof value !== "string") {
    throw new TypeError("Chess.com kullanıcı adı metin olmalı.");
  }

  const username = value.trim();
  const validCharacters = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;

  if (username.length < 3 || username.length > 50 || !validCharacters.test(username)) {
    throw new TypeError(
      "Geçerli bir Chess.com kullanıcı adı gir: en az 3 karakter; yalnızca harf, rakam, _ ve - kullan.",
    );
  }

  return username;
}

export function validateGameLimit(value) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("Maç limiti 1 ile 100 arasında bir tam sayı olmalı.");
  }

  return limit;
}

function apiErrorForResponse(response, requestContext) {
  if (response.status === 404) {
    return new ChessComApiError("Chess.com kullanıcısı veya arşiv verisi bulunamadı.", {
      code: "NOT_FOUND",
      status: response.status,
      ...requestContext,
    });
  }

  if (response.status === 410) {
    return new ChessComApiError("Chess.com bu verinin artık kullanılamadığını bildirdi.", {
      code: "GONE",
      status: response.status,
      ...requestContext,
    });
  }

  if (response.status === 429) {
    return new ChessComApiError("Chess.com istek sınırına ulaşıldı; daha sonra yeniden dene.", {
      code: "RATE_LIMITED",
      status: response.status,
      ...requestContext,
    });
  }

  return new ChessComApiError(`Chess.com isteği başarısız oldu (HTTP ${response.status}).`, {
    code: "HTTP_ERROR",
    status: response.status,
    ...requestContext,
  });
}

export function parseArchiveMonth(archiveUrl) {
  let parsed;

  try {
    parsed = new URL(archiveUrl);
  } catch {
    throw new ChessComApiError("Chess.com geçersiz bir arşiv adresi döndürdü.", {
      code: "INVALID_RESPONSE",
    });
  }

  if (parsed.origin !== "https://api.chess.com") {
    throw new ChessComApiError("Chess.com beklenmeyen bir arşiv sunucusu döndürdü.", {
      code: "INVALID_RESPONSE",
    });
  }

  const match = parsed.pathname.match(/\/games\/(\d{4})\/(\d{2})\/?$/);

  if (!match) {
    throw new ChessComApiError("Chess.com geçersiz bir arşiv ayı döndürdü.", {
      code: "INVALID_RESPONSE",
    });
  }

  return { year: match[1], month: match[2] };
}

export class ChessComClient {
  constructor({
    fetchImpl = createPlatformFetch(),
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    contact = defaultContact(),
    sendUserAgent = isNodeRuntime(),
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
    sleepImpl = sleep,
    randomImpl = Math.random,
    nowImpl = Date.now,
    onRetry = async () => {},
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("Bu çalışma ortamında fetch desteği bulunamadı.");
    }

    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.retryMaxDelayMs = retryMaxDelayMs;
    this.sleepImpl = sleepImpl;
    this.randomImpl = randomImpl;
    this.nowImpl = nowImpl;
    this.onRetry = onRetry;
    this.userAgent = contact
      ? `Satranc-Mezarligi/0.1 (technical-prototype; contact: ${contact})`
      : "Satranc-Mezarligi/0.1 (technical-prototype)";
    this.requestHeaders = { Accept: "application/json" };
    if (sendUserAgent) {
      this.requestHeaders["User-Agent"] = this.userAgent;
    }
  }

  async getPlayer(username) {
    return this.#getJson(`/player/${encodeURIComponent(validateUsername(username))}`, {
      stage: "profile",
    });
  }

  async getArchiveUrls(username) {
    const requestPath = `/player/${encodeURIComponent(validateUsername(username))}/games/archives`;
    const data = await this.#getJson(
      requestPath,
      { stage: "archiveList" },
    );

    if (!Array.isArray(data.archives)) {
      throw new ChessComApiError("Chess.com arşiv listesi beklenen biçimde değil.", {
        code: "INVALID_RESPONSE",
        stage: "archiveList",
        requestPath,
        requestUrl: `${this.baseUrl}${requestPath}`,
      });
    }

    return data.archives;
  }

  async getMonthlyGames(username, year, month) {
    const archive = `${year}/${month}`;
    const requestPath = `/player/${encodeURIComponent(validateUsername(username))}/games/${archive}`;
    const data = await this.#getJson(
      requestPath,
      { stage: "archiveMonth", archive },
    );

    if (!Array.isArray(data.games)) {
      throw new ChessComApiError("Chess.com aylık oyun verisi beklenen biçimde değil.", {
        code: "INVALID_RESPONSE",
        stage: "archiveMonth",
        archive,
        requestPath,
        requestUrl: `${this.baseUrl}${requestPath}`,
      });
    }

    return data.games;
  }

  async #getJson(path, context = {}) {
    const requestUrl = `${this.baseUrl}${path}`;
    const requestContext = {
      ...context,
      requestPath: path,
      requestUrl,
    };

    if (typeof globalThis.AbortSignal?.timeout !== "function") {
      throw new ChessComApiError(
        "Bu tarayıcı güvenli istek zaman aşımı özelliğini desteklemiyor.",
        { code: "UNSUPPORTED_BROWSER", ...requestContext },
      );
    }

    for (let retryIndex = 0; ; retryIndex += 1) {
      let response;

      try {
        response = await this.fetchImpl(requestUrl, {
          headers: {
            ...this.requestHeaders,
          },
          redirect: "follow",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        if (!isFetchInvocationError(cause) && retryIndex < this.maxRetries) {
          await this.#waitBeforeRetry({
            path,
            retryIndex,
            cause,
            requestContext,
          });
          continue;
        }

        throw connectionError(cause, requestContext);
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && retryIndex < this.maxRetries) {
          await this.#waitBeforeRetry({
            path,
            retryIndex,
            response,
            requestContext,
          });
          continue;
        }

        throw apiErrorForResponse(response, requestContext);
      }

      try {
        return await response.json();
      } catch (cause) {
        if (isTransientBodyReadError(cause)) {
          if (retryIndex < this.maxRetries) {
            await this.#waitBeforeRetry({
              path,
              retryIndex,
              cause,
              requestContext,
            });
            continue;
          }

          throw connectionError(cause, requestContext);
        }

        throw new ChessComApiError("Chess.com geçersiz JSON verisi döndürdü.", {
          code: "INVALID_RESPONSE",
          status: response.status,
          cause,
          ...requestContext,
        });
      }
    }
  }

  async #waitBeforeRetry({ path, retryIndex, response, cause, requestContext }) {
    if (response?.body) {
      try {
        await response.body.cancel();
      } catch {
        // Retry güvenliği, hata gövdesinin kapatılamamasına bağlı olmamalı.
      }
    }

    const status = response?.status;
    const backoffStart = status === 429 ? MIN_RATE_LIMIT_DELAY_MS : this.retryBaseDelayMs;
    const exponentialDelay = Math.min(
      this.retryMaxDelayMs,
      backoffStart * 2 ** retryIndex,
    );
    const serverDelay = response ? parseRetryAfter(response, this.nowImpl()) : 0;
    const baseDelay = Math.max(exponentialDelay, serverDelay);
    const jitter = Math.floor(baseDelay * Math.max(0, this.randomImpl()) * 0.2);
    const delayMs = baseDelay + jitter;
    const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
    const reason = status === 429
      ? "rateLimited"
      : status
        ? "serverError"
        : timedOut
          ? "timeout"
          : "network";

    await this.onRetry({
      type: "retry",
      path,
      failedAttempt: retryIndex + 1,
      nextAttempt: retryIndex + 2,
      maxAttempts: this.maxRetries + 1,
      delayMs,
      reason,
      status: status ?? null,
      stage: requestContext.stage ?? null,
      requestUrl: requestContext.requestUrl,
      archive: requestContext.archive ?? null,
      causeName: typeof cause?.name === "string" ? cause.name : null,
      causeMessage: typeof cause?.message === "string" ? cause.message : null,
    });
    await this.sleepImpl(delayMs);
  }
}

export async function fetchRecentGames(client, requestedUsername, requestedLimit) {
  const username = validateUsername(requestedUsername);
  const limit = validateGameLimit(requestedLimit);
  const profile = await client.getPlayer(username);
  const canonicalUsername = validateUsername(profile.username);
  const archiveUrls = await client.getArchiveUrls(canonicalUsername);
  const games = [];
  const seenGameIds = new Set();
  let duplicateGamesSkipped = 0;
  let archiveMonthsFetched = 0;
  let archiveGameRecordsReceived = 0;

  for (const archiveUrl of [...archiveUrls].reverse()) {
    const { year, month } = parseArchiveMonth(archiveUrl);
    const monthlyGames = await client.getMonthlyGames(canonicalUsername, year, month);
    archiveMonthsFetched += 1;
    archiveGameRecordsReceived += monthlyGames.length;

    const newestFirst = [...monthlyGames].sort(
      (left, right) => Number(right.end_time ?? 0) - Number(left.end_time ?? 0),
    );

    for (const game of newestFirst) {
      const gameIds = await getGameIdentities(game);
      if (gameIds.some((gameId) => seenGameIds.has(gameId))) {
        duplicateGamesSkipped += 1;
        continue;
      }

      for (const gameId of gameIds) {
        seenGameIds.add(gameId);
      }
      games.push(game);

      if (games.length === limit) {
        break;
      }
    }

    if (games.length === limit) {
      break;
    }
  }

  return {
    requestedUsername: username,
    canonicalUsername,
    profileUrl: profile["@id"],
    requestedLimit: limit,
    games,
    archiveMonthsFetched,
    archiveGameRecordsReceived,
    duplicateGamesSkipped,
  };
}
