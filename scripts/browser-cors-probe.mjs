import { createServer } from "node:http";
import { chromium } from "playwright";

const username = process.argv[2] ?? "Hiy-Z";
const host = "127.0.0.1";

const server = createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end("<!doctype html><html><body>Chess.com CORS probe</body></html>");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, host, resolve);
});

const address = server.address();
const origin = `http://${host}:${address.port}`;
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: ["--noerrdialogs", "--disable-breakpad", "--disable-crash-reporter"],
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async (requestedUsername) => {
    async function requestJson(url) {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      return {
        response: {
          ok: response.ok,
          status: response.status,
          type: response.type,
          url: response.url,
        },
        data,
      };
    }

    try {
      const encodedUsername = encodeURIComponent(requestedUsername);
      const profile = await requestJson(
        `https://api.chess.com/pub/player/${encodedUsername}`,
      );
      const archives = await requestJson(
        `https://api.chess.com/pub/player/${encodedUsername}/games/archives`,
      );
      const latestArchiveUrl = archives.data.archives.at(-1);
      const latestMonth = await requestJson(latestArchiveUrl);

      return {
        ok: true,
        origin: location.origin,
        profile: {
          ...profile.response,
          username: profile.data.username,
        },
        archives: {
          ...archives.response,
          count: archives.data.archives.length,
        },
        latestMonth: {
          ...latestMonth.response,
          gameCount: latestMonth.data.games.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        origin: location.origin,
        error: error.name,
        message: error.message,
      };
    }
  }, username);

  console.log(JSON.stringify({
    browser: {
      engine: "chromium",
      version: browser.version(),
      executablePath: chromium.executablePath(),
    },
    result,
  }, null, 2));

  if (!result.ok) {
    process.exitCode = 2;
  }
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
