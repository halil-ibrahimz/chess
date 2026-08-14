export const RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

const CACHE_VERSION = 1;
const CACHE_PREFIX = "satranc-mezarligi:history-result:";

function normalizedUsername(username) {
  return typeof username === "string"
    ? username.trim().toLocaleLowerCase("en-US")
    : "";
}

function cacheKey(username) {
  return `${CACHE_PREFIX}${normalizedUsername(username)}`;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function isUsableResult(result) {
  return Boolean(
    result &&
      typeof result === "object" &&
      typeof result.username === "string" &&
      isCount(result.uniqueGamesProcessed) &&
      isCount(result.gamesExamined) &&
      result.lostPieces &&
      ["total", "pawn", "knight", "bishop", "rook", "queen"].every((piece) =>
        isCount(result.lostPieces[piece]),
      ),
  );
}

function safelyRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Önbellek desteği taramanın çalışması için zorunlu değildir.
  }
}

export function readCachedResult(storage, username, now = Date.now()) {
  const key = cacheKey(username);

  if (!storage || !normalizedUsername(username)) {
    return null;
  }

  try {
    const serialized = storage.getItem(key);
    if (!serialized) {
      return null;
    }

    const record = JSON.parse(serialized);
    const valid =
      record?.version === CACHE_VERSION &&
      Number.isFinite(record.savedAt) &&
      Number.isFinite(record.expiresAt) &&
      record.expiresAt > now &&
      isUsableResult(record.result);

    if (!valid) {
      safelyRemove(storage, key);
      return null;
    }

    return record;
  } catch {
    safelyRemove(storage, key);
    return null;
  }
}

export function writeCachedResult(
  storage,
  username,
  result,
  now = Date.now(),
  ttlMs = RESULT_CACHE_TTL_MS,
) {
  if (!storage || !normalizedUsername(username) || !isUsableResult(result)) {
    return false;
  }

  const record = {
    version: CACHE_VERSION,
    savedAt: now,
    expiresAt: now + ttlMs,
    result,
  };

  try {
    storage.setItem(cacheKey(username), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
