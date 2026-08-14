import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import { careerPosterFixture } from "./fixtures/career-poster.fixture.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, ".tmp", "career-poster-visual");
const posterScreenshot = path.join(outputDirectory, "career-poster-1080x1350.png");
const expectedImages = [
  "king.webp",
  "pawn.webp",
  "knight.webp",
  "bishop.webp",
  "rook.webp",
  "queen.webp",
  "bloodiest-victory-pawn.webp",
  "longest-battle-rook.webp",
  "fastest-checkmate-knight.webp",
];
const numberFormatter = new Intl.NumberFormat("tr-TR");

let viteServer;
let browser;

function watchPage(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [], chessComRequests: [] };
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "api.chess.com") {
      diagnostics.chessComRequests.push(request.url());
    }
  });
  return diagnostics;
}

function assertCleanPage(diagnostics, label) {
  assert.deepEqual(diagnostics.consoleErrors, [], `${label}: konsol hatası olmamalı.`);
  assert.deepEqual(diagnostics.pageErrors, [], `${label}: sayfa hatası olmamalı.`);
  assert.deepEqual(diagnostics.chessComRequests, [], `${label}: Chess.com isteği göndermemeli.`);
}

async function waitForPosterImages(page) {
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('[data-testid="career-poster-canvas"] img')];
    return images.length === 9
      && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  });
}

async function posterLayout(page) {
  return page.evaluate(() => {
    const poster = document.querySelector('[data-testid="career-poster-canvas"]');
    if (!poster) {
      throw new Error("Poster tuvali bulunamadı.");
    }
    const posterRect = poster.getBoundingClientRect();
    const style = getComputedStyle(poster);
    const images = [...poster.querySelectorAll("img")].map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        source: image.currentSrc,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      };
    });
    const username = poster.querySelector('[data-testid="career-poster-username"]');
    const usernameRect = username.getBoundingClientRect();
    const identityRect = username.parentElement.getBoundingClientRect();
    return {
      cssWidth: Number.parseFloat(style.width),
      cssHeight: Number.parseFloat(style.height),
      renderedWidth: posterRect.width,
      renderedHeight: posterRect.height,
      scrollWidth: poster.scrollWidth,
      scrollHeight: poster.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      images,
      username: {
        fontSize: Number.parseFloat(getComputedStyle(username).fontSize),
        clientWidth: username.clientWidth,
        scrollWidth: username.scrollWidth,
        left: usernameRect.left,
        right: usernameRect.right,
        containerLeft: identityRect.left,
        containerRight: identityRect.right,
      },
    };
  });
}

function assertImages(layout) {
  assert.equal(layout.images.length, expectedImages.length, "Dokuz gerçek taş görseli yüklenmeli.");
  for (const expectedImage of expectedImages) {
    const image = layout.images.find(({ source }) => source.includes(expectedImage));
    assert.ok(image, `${expectedImage} posterde kullanılmalı.`);
    assert.equal(image.complete, true);
    assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0);
    assert.equal(image.objectFit, "contain", `${expectedImage} kırpılmamalı.`);
    assert.ok(image.rect.left >= -0.5 && image.rect.top >= -0.5);
    assert.ok(image.rect.right <= layout.renderedWidth + 60.5);
    assert.ok(image.rect.bottom <= layout.renderedHeight + 52.5);
  }
}

async function recordLayout(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".career-poster__record")].map((record) => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const image = record.querySelector("img");
      const value = record.querySelector("dd");
      return {
        record: bounds(record),
        value: bounds(value),
        image: bounds(image),
        imageHeight: image.getBoundingClientRect().height,
        imageWidth: image.getBoundingClientRect().width,
        objectFit: getComputedStyle(image).objectFit,
        recordOverflow: getComputedStyle(record).overflow,
        valueFontSize: Number.parseFloat(getComputedStyle(value).fontSize),
        valueScrollWidth: value.scrollWidth,
        valueClientWidth: value.clientWidth,
        source: image.currentSrc,
      };
    }),
  );
}

function assertRecordLayout(records) {
  assert.equal(records.length, 3, "Üç kariyer kaydı sütunu bulunmalı.");
  assert.ok(records.every(({ imageHeight, imageWidth }) =>
    imageHeight === 110 && imageWidth === 110), "Kayıt görselleri aynı 110 px kutuyu kullanmalı.");
  assert.ok(records.every(({ objectFit }) => objectFit === "contain"), "Kayıt görselleri kırpılmamalı.");
  assert.ok(records.every(({ record, image, value, recordOverflow }) =>
    image.left >= record.left
      && image.right <= record.right
      && value.right <= image.left
      && recordOverflow === "hidden"), "Kayıt görseli yazıyla çakışmamalı veya sütun ayırıcılarını aşmamalı.");
  assert.ok(records.every(({ valueScrollWidth, valueClientWidth }) =>
    valueScrollWidth <= valueClientWidth + 1), "Kayıt değeri ayrılan metin alanından taşmamalı.");
}

async function pngDimensions(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", "Ekran görüntüsü PNG olmalı.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function inspectDefaultPoster(origin) {
  const context = await browser.newContext({ viewport: { width: 1_200, height: 1_500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(`${origin}/poster-preview.html`, { waitUntil: "networkidle" });
  await waitForPosterImages(page);
  await page.waitForTimeout(50);

  const layout = await posterLayout(page);
  assert.equal(layout.cssWidth, 1_080);
  assert.equal(layout.cssHeight, 1_350);
  assert.equal(layout.renderedWidth, 1_080);
  assert.equal(layout.renderedHeight, 1_350);
  assert.equal(layout.scrollWidth, 1_080, "Poster yatay taşma üretmemeli.");
  assert.equal(layout.scrollHeight, 1_350, "Poster dikey taşma üretmemeli.");
  assertImages(layout);
  assertRecordLayout(await recordLayout(page));
  assert.equal(
    await page.getByTestId("career-poster-username").textContent(),
    careerPosterFixture.displayUsername,
  );
  await page.getByText("OYUNCU", { exact: true }).waitFor();
  const officerLabels = await page.evaluate(() =>
    [...document.querySelectorAll(".career-poster__officer p")].map((value) => {
      const numberRect = value.querySelector("strong").getBoundingClientRect();
      const labelRect = value.querySelector("span").getBoundingClientRect();
      return {
        numberLeft: numberRect.left,
        numberBottom: numberRect.bottom,
        labelLeft: labelRect.left,
        labelTop: labelRect.top,
      };
    }),
  );
  assert.equal(officerLabels.length, 4);
  assert.ok(
    officerLabels.every(({ numberLeft, numberBottom, labelLeft, labelTop }) =>
      Math.abs(numberLeft - labelLeft) < 1 && labelTop >= numberBottom),
    "At, fil, kale ve vezir kayıp etiketleri sayıların altında aynı hizada olmalı.",
  );
  assert.equal(
    await page.getByTestId("career-poster-total-games").textContent(),
    numberFormatter.format(careerPosterFixture.totalGames),
  );
  assert.equal(
    await page.getByTestId("career-poster-total-losses").textContent(),
    numberFormatter.format(careerPosterFixture.totalLosses),
  );
  for (const piece of ["pawn", "knight", "bishop", "rook", "queen"]) {
    assert.equal(
      await page.getByTestId(`career-poster-loss-${piece}`).textContent(),
      numberFormatter.format(careerPosterFixture.lostPieces[piece]),
    );
  }
  assert.equal(
    await page.getByTestId("career-poster-record-bloodiest").textContent(),
    `${numberFormatter.format(careerPosterFixture.careerRecords.bloodiestWin.lostPieces.total)} taş`,
  );
  assert.equal(
    await page.getByTestId("career-poster-record-longest").textContent(),
    `${numberFormatter.format(careerPosterFixture.careerRecords.longestBattle.moveCount)} hamle`,
  );
  assert.equal(
    await page.getByTestId("career-poster-record-fastest").textContent(),
    `${numberFormatter.format(careerPosterFixture.careerRecords.fastestCheckmate.moveCount)} hamle`,
  );

  await page.getByTestId("career-poster-canvas").screenshot({ path: posterScreenshot });
  assert.deepEqual(await pngDimensions(posterScreenshot), { width: 1_080, height: 1_350 });
  assertCleanPage(diagnostics, "Varsayılan poster");
  await context.close();
  return { screenshot: posterScreenshot, width: 1_080, height: 1_350 };
}

async function inspectLongUsername(origin) {
  const context = await browser.newContext({ viewport: { width: 1_200, height: 1_500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(`${origin}/poster-preview.html?scenario=long-username`, { waitUntil: "networkidle" });
  await waitForPosterImages(page);
  await page.waitForTimeout(50);
  const layout = await posterLayout(page);
  assert.ok(layout.username.fontSize < 104, "Uzun kullanıcı adı otomatik küçülmeli.");
  assert.ok(
    layout.username.scrollWidth <= layout.username.clientWidth + 1,
    `Uzun kullanıcı adı taşmamalı: ${JSON.stringify(layout.username)}`,
  );
  assert.ok(
    layout.username.left >= layout.username.containerLeft - 0.5
      && layout.username.right <= layout.username.containerRight + 0.5,
    "Uzun kullanıcı adı kesilmemeli.",
  );
  assertCleanPage(diagnostics, "Uzun kullanıcı adı posteri");
  await context.close();
  return { fitted: true, fontSize: layout.username.fontSize };
}

async function inspectMissingRecords(origin) {
  const context = await browser.newContext({ viewport: { width: 1_200, height: 1_500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(`${origin}/poster-preview.html?scenario=missing-records`, { waitUntil: "networkidle" });
  await waitForPosterImages(page);
  assert.equal(
    await page.getByText("Kayıt bulunamadı", { exact: true }).count(),
    3,
    "Eksik üç kariyer kaydı düzeni bozmadan gösterilmeli.",
  );
  const layout = await posterLayout(page);
  assert.equal(layout.scrollWidth, 1_080);
  assert.equal(layout.scrollHeight, 1_350);
  assertRecordLayout(await recordLayout(page));
  assertCleanPage(diagnostics, "Eksik kariyer kayıtları posteri");
  await context.close();
  return { fallbackCount: 3 };
}

async function inspectLongRecordValues(origin) {
  const context = await browser.newContext({ viewport: { width: 1_200, height: 1_500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(`${origin}/poster-preview.html?scenario=long-record-values`, { waitUntil: "networkidle" });
  await waitForPosterImages(page);
  const records = await recordLayout(page);
  assertRecordLayout(records);
  assert.ok(
    records.every(({ valueFontSize }) => valueFontSize >= 18 && valueFontSize <= 31),
    "Uzun kayıt değerleri yalnız gerektiği kadar küçülmeli.",
  );
  assertCleanPage(diagnostics, "Uzun kariyer kaydı değerleri posteri");
  await context.close();
  return { fitted: true, fontSizes: records.map(({ valueFontSize }) => valueFontSize) };
}

async function inspectResponsivePreview(origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(`${origin}/poster-preview.html`, { waitUntil: "networkidle" });
  await waitForPosterImages(page);
  await page.waitForTimeout(50);
  const layout = await posterLayout(page);
  assert.equal(layout.cssWidth, 1_080, "Küçük ekranda iç poster genişliği değişmemeli.");
  assert.equal(layout.cssHeight, 1_350, "Küçük ekranda iç poster yüksekliği değişmemeli.");
  assert.ok(layout.renderedWidth < 1_080 && layout.renderedHeight < 1_350, "Ön izleme responsive küçülmeli.");
  assert.equal(layout.documentWidth, layout.clientWidth, "Dar ön izlemede yatay taşma olmamalı.");
  assertCleanPage(diagnostics, "Responsive poster ön izlemesi");
  await context.close();
  return { width: layout.renderedWidth, height: layout.renderedHeight };
}

try {
  await mkdir(outputDirectory, { recursive: true });
  viteServer = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, "vite.config.js"),
    clearScreen: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite rastgele localhost portunu bildirmedi.");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({
    headless: true,
    args: ["--noerrdialogs", "--disable-breakpad", "--disable-crash-reporter"],
  });

  const poster = await inspectDefaultPoster(origin);
  const longUsername = await inspectLongUsername(origin);
  const missingRecords = await inspectMissingRecords(origin);
  const longRecordValues = await inspectLongRecordValues(origin);
  const responsive = await inspectResponsivePreview(origin);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    browser: { engine: "chromium", version: browser.version() },
    poster,
    longUsername,
    missingRecords,
    longRecordValues,
    responsive,
  }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => {});
  await viteServer?.close().catch(() => {});
}
