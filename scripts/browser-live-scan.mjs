import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const TEST_TIMEOUT_MS = 8 * 60 * 1_000;
const POLL_INTERVAL_MS = 100;
const USERNAME = process.argv[2] ?? "Hiy-Z";
const API_ORIGIN = "https://api.chess.com";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let viteServer;
let browser;
let page;
let phase = "initializing";
let browserDisconnected = false;
let lastState = null;
let lastAlert = null;

const diagnostics = {
  console: [],
  pageErrors: [],
  requestFailures: [],
  apiResponses: [],
};
const progress = [];
const retryEvents = [];
const activeApiRequests = new Set();
let maximumConcurrentApiRequests = 0;
let globalTimeoutId;
const wallStartedAt = performance.now();

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function boundedPush(target, value, limit = 100) {
  target.push(value);
  if (target.length > limit) {
    target.shift();
  }
}

function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url);
  }
}

function isApiRequest(request) {
  try {
    return new URL(request.url()).origin === API_ORIGIN;
  } catch {
    return false;
  }
}

function serializeError(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(typeof error?.code === "string" ? { code: error.code } : {}),
    ...(typeof error?.stack === "string" ? { stack: error.stack } : {}),
  };
}

function collectState(snapshot, elapsedMs) {
  lastState = snapshot;

  if (snapshot?.progress) {
    const event = snapshot.progress;
    const record = {
      elapsedMs,
      stage: event.stage ?? null,
      archives: event.archives ?? null,
      games: event.games ?? null,
    };
    const previous = progress.at(-1);
    const recordKey = JSON.stringify([record.stage, record.archives, record.games]);
    const previousKey = previous
      ? JSON.stringify([previous.stage, previous.archives, previous.games])
      : null;
    if (recordKey !== previousKey) {
      progress.push(record);
    }
  }

  if (snapshot?.retryEvent) {
    const retry = snapshot.retryEvent;
    const record = {
      elapsedMs,
      reason: retry.reason ?? null,
      status: retry.status ?? null,
      failedAttempt: retry.failedAttempt ?? null,
      nextAttempt: retry.nextAttempt ?? null,
      delayMs: retry.delayMs ?? null,
      path: typeof retry.path === "string" ? retry.path : null,
    };
    const previous = retryEvents.at(-1);
    const sameRetry = previous
      && previous.reason === record.reason
      && previous.status === record.status
      && previous.failedAttempt === record.failedAttempt
      && previous.nextAttempt === record.nextAttempt
      && previous.delayMs === record.delayMs
      && previous.path === record.path;
    if (!sameRetry) {
      retryEvents.push(record);
    }
  }
}

async function readUiState() {
  return page.evaluate(() => globalThis.__SATRANC_MEZARLIGI_TEST__ ?? null);
}

async function runLiveScan() {
  phase = "startingVite";
  viteServer = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, "vite.config.js"),
    clearScreen: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
    },
  });
  await viteServer.listen();

  const address = viteServer.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite rastgele localhost portunu bildirmedi.");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  phase = "launchingBundledChromium";
  browser = await chromium.launch({
    headless: true,
    args: [
      "--noerrdialogs",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--enable-precise-memory-info",
    ],
  });
  browser.on("disconnected", () => {
    browserDisconnected = true;
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      boundedPush(diagnostics.console, {
        type: message.type(),
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on("pageerror", (error) => {
    boundedPush(diagnostics.pageErrors, serializeError(error));
  });
  context.on("request", (request) => {
    if (!isApiRequest(request)) {
      return;
    }
    activeApiRequests.add(request);
    maximumConcurrentApiRequests = Math.max(
      maximumConcurrentApiRequests,
      activeApiRequests.size,
    );
  });
  context.on("response", (response) => {
    if (isApiRequest(response.request())) {
      boundedPush(
        diagnostics.apiResponses,
        {
          method: response.request().method(),
          path: safePathname(response.url()),
          status: response.status(),
        },
        500,
      );
    }
  });
  context.on("requestfinished", (request) => {
    activeApiRequests.delete(request);
  });
  context.on("requestfailed", (request) => {
    activeApiRequests.delete(request);
    if (!isApiRequest(request)) {
      return;
    }
    boundedPush(diagnostics.requestFailures, {
      method: request.method(),
      path: safePathname(request.url()),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText ?? "unknown",
    });
  });

  phase = "loadingApp";
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(USERNAME);

  phase = "scanning";
  const scanStartedAt = performance.now();
  await page.locator('button[type="submit"]').click();

  while (performance.now() - wallStartedAt < TEST_TIMEOUT_MS) {
    if (browserDisconnected) {
      throw new Error("Playwright Chromium tarama sırasında beklenmedik biçimde kapandı.");
    }

    const snapshot = await readUiState();
    collectState(snapshot, round(performance.now() - scanStartedAt));

    if (snapshot?.status === "complete") {
      if (!snapshot.result) {
        throw new Error("Arayüz tamamlandı durumuna geçti fakat final sonuç üretmedi.");
      }
      if (maximumConcurrentApiRequests > 1) {
        throw new Error(
          `Chess.com istekleri seri değildi; aynı anda ${maximumConcurrentApiRequests} istek görüldü.`,
        );
      }

      const result = snapshot.result;
      const browserPerformance = result.browserPerformance ?? {};
      return {
        ok: true,
        test: "browser-live-scan",
        username: result.username ?? USERNAME,
        origin,
        browser: {
          engine: "chromium",
          version: browser.version(),
          executablePath: chromium.executablePath(),
          headless: true,
          viewport: { width: 390, height: 844 },
        },
        measurements: {
          wallDurationMs: round(performance.now() - scanStartedAt),
          appDurationMs: browserPerformance.durationMs ?? null,
          mainThreadMaximumDelayMs: browserPerformance.maxMainThreadDelayMs ?? null,
          heap: {
            available: browserPerformance.heapAvailable ?? false,
            initialMiB: browserPerformance.initialHeapMiB ?? null,
            finalMiB: browserPerformance.finalHeapMiB ?? null,
            changeMiB: browserPerformance.heapChangeMiB ?? null,
          },
          maximumConcurrentApiRequests,
          apiRequestCount:
            diagnostics.apiResponses.length + diagnostics.requestFailures.length,
        },
        result: {
          archiveMonthsFound: result.archiveMonthsFound,
          archiveMonthsProcessed: result.archiveMonthsProcessed,
          gameRecordsFound: result.gameRecordsFound,
          uniqueGamesProcessed: result.uniqueGamesProcessed,
          gamesExamined: result.gamesExamined,
          gamesSkipped: result.gamesSkipped,
          duplicateGameRecordsSkipped: result.duplicateGameRecordsSkipped,
          lostPieces: result.lostPieces,
          workerPerformance: result.performance ?? null,
        },
        progress,
        retryEvents,
        diagnostics,
      };
    }

    if (snapshot?.status === "error" || snapshot?.status === "cancelled") {
      lastAlert = await page
        .locator('[role="alert"], [role="status"]')
        .last()
        .textContent()
        .catch(() => null);
      const error = new Error(
        lastAlert?.trim() || `Arayüz beklenmeyen ${snapshot.status} durumuna geçti.`,
      );
      error.code = snapshot.status === "error" ? "UI_SCAN_ERROR" : "UI_SCAN_CANCELLED";
      throw error;
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  throw new Error(`Canlı tarama ${TEST_TIMEOUT_MS / 60_000} dakika içinde tamamlanmadı.`);
}

const timeoutPromise = new Promise((_, reject) => {
  globalTimeoutId = setTimeout(() => {
    const error = new Error(
      `Canlı tarama ${TEST_TIMEOUT_MS / 60_000} dakikalık üst süreyi aştı.`,
    );
    error.code = "LIVE_SCAN_TIMEOUT";
    reject(error);
  }, TEST_TIMEOUT_MS);
});

try {
  const output = await Promise.race([runLiveScan(), timeoutPromise]);
  clearTimeout(globalTimeoutId);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  clearTimeout(globalTimeoutId);

  if (error?.code !== "LIVE_SCAN_TIMEOUT" && page && !page.isClosed()) {
    lastState = await readUiState().catch(() => lastState);
    lastAlert = await page
      .locator('[role="alert"], [role="status"]')
      .last()
      .textContent()
      .catch(() => lastAlert);
  }

  const failure = {
    ok: false,
    test: "browser-live-scan",
    username: USERNAME,
    phase,
    durationMs: round(performance.now() - wallStartedAt),
    browser: browser
      ? {
          engine: "chromium",
          version: browserDisconnected ? null : browser.version(),
          executablePath: chromium.executablePath(),
          disconnected: browserDisconnected,
        }
      : {
          engine: "chromium",
          executablePath: chromium.executablePath(),
          launched: false,
        },
    error: serializeError(error),
    lastState,
    lastAlert: lastAlert?.trim() || null,
    progress,
    retryEvents,
    measurements: {
      maximumConcurrentApiRequests,
      activeApiRequestsAtFailure: activeApiRequests.size,
    },
    diagnostics,
  };
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await viteServer?.close().catch(() => {});
}
