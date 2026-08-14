import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, ".tmp", "browser-result-visual");
const cacheKey = "satranc-mezarligi:history-result:hiy-z";
const result = {
  username: "hiy-z",
  displayUsername: "hiy-z",
  archiveMonthsFound: 131,
  archiveMonthsProcessed: 131,
  gameRecordsFound: 5_109,
  uniqueGamesProcessed: 5_109,
  gamesExamined: 5_109,
  gamesSkipped: 0,
  duplicateGameRecordsSkipped: 0,
  lostPieces: {
    total: 37_923,
    pawn: 16_103,
    knight: 8_058,
    bishop: 6_911,
    rook: 4_407,
    queen: 2_444,
  },
  careerRecords: {
    bloodiestWin: {
      url: "https://www.chess.com/game/live/172260612500",
      opponent: { username: "Pauloxdrz", rating: 1_810 },
      playerColor: "white",
      endTime: 1_785_357_288,
      timeClass: "bullet",
      timeControl: "60",
      userResult: "win",
      playerRawResult: "win",
      opponentRawResult: "timeout",
      moveCount: 53,
      plyCount: 105,
      lostPieces: {
        total: 14,
        pawn: 6,
        knight: 2,
        bishop: 2,
        rook: 2,
        queen: 2,
      },
    },
    longestBattle: {
      url: "https://www.chess.com/game/live/169548729968",
      opponent: { username: "chesse99", rating: 1_864 },
      playerColor: "black",
      endTime: 1_780_315_619,
      timeClass: "bullet",
      timeControl: "60",
      userResult: "loss",
      playerRawResult: "timeout",
      opponentRawResult: "win",
      moveCount: 76,
      plyCount: 151,
      lostPieces: {
        total: 15,
        pawn: 8,
        knight: 2,
        bishop: 2,
        rook: 2,
        queen: 1,
      },
    },
    fastestCheckmate: {
      url: "https://www.chess.com/game/live/75087687503",
      opponent: { username: "Atothej1985", rating: 1_711 },
      playerColor: "white",
      endTime: 1_681_348_628,
      timeClass: "bullet",
      timeControl: "60",
      userResult: "win",
      playerRawResult: "win",
      opponentRawResult: "checkmated",
      moveCount: 6,
      plyCount: 11,
      lostPieces: {
        total: 1,
        pawn: 1,
        knight: 0,
        bishop: 0,
        rook: 0,
        queen: 0,
      },
    },
    queenLossWins: 1_027,
    flawlessWins: 30,
  },
  performance: {
    durationMs: 82_400,
    memory: { available: false },
  },
  browserPerformance: {
    durationMs: 82_400,
    maxMainThreadDelayMs: 12.4,
    heapAvailable: true,
    initialHeapMiB: 21.2,
    finalHeapMiB: 22.1,
    heapChangeMiB: 0.9,
  },
};

const fixtureRecord = {
  version: 1,
  savedAt: Date.UTC(2026, 7, 10, 9),
  expiresAt: Date.UTC(2100, 0, 1),
  result,
};

const viewports = [
  { name: "mobile-320x568", width: 320, height: 568, screenshot: true },
  { name: "mobile-360x800", width: 360, height: 800, screenshot: true },
  { name: "mobile-390x844", width: 390, height: 844, screenshot: true },
  { name: "desktop-1440x1000", width: 1_440, height: 1_000, screenshot: true },
];

const careerRecordExpectations = [
  {
    testId: "career-record-bloodiestWin",
    url: result.careerRecords.bloodiestWin.url,
  },
  {
    testId: "career-record-longestBattle",
    url: result.careerRecords.longestBattle.url,
  },
  {
    testId: "career-record-fastestCheckmate",
    url: result.careerRecords.fastestCheckmate.url,
  },
];

let viteServer;
let browser;

async function assertFormattedValue(page, testId, expected) {
  const value = await page.getByTestId(testId).textContent();
  assert.equal(value?.trim(), expected, `${testId} Türkçe sayı biçimiyle gösterilmeli.`);
}

async function pngDimensions(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", "İndirilen kart PNG olmalı.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function watchPage(page) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    chessComRequests: [],
  };

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
  assert.deepEqual(diagnostics.pageErrors, [], `${label}: sayfa çalışma zamanı hatası olmamalı.`);
  assert.deepEqual(
    diagnostics.chessComRequests,
    [],
    `${label}: fixture testi Chess.com isteği göndermemeli.`,
  );
}

async function assertBranding(page) {
  assert.equal(
    await page.title(),
    "Düşen Taşlar — Chess.com Kariyer Arşivi",
    "Tarayıcı başlığı yeni marka adını taşımalı.",
  );
  const metaDescription = await page.locator('meta[name="description"]').getAttribute("content");
  assert.match(metaDescription ?? "", /Düşen Taşlar/u, "Meta açıklaması yeni marka adını taşımalı.");
  await page.getByText("CHESS.COM KARİYER ARŞİVİ", { exact: true }).waitFor();
  await page.getByRole("heading", { level: 1, name: "Düşen Taşlar" }).waitFor();
  await page.getByText(
    "Chess.com kullanıcı adını gir. Herkese açık kariyerindeki maçlar taransın; düşen taşların ve unutulmayan savaşların ortaya çıksın.",
    { exact: true },
  ).waitFor();
}

async function inspectIntroArchiveBishop(page, viewport) {
  const bishop = page.getByTestId("intro-archive-bishop");
  await bishop.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="intro-archive-bishop"] img');
    return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  });

  const layout = await page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Beklenen ilk ekran öğesi bulunamadı: ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const image = document.querySelector('[data-testid="intro-archive-bishop"] img');
    const bishopElement = image.closest('[data-testid="intro-archive-bishop"]');
    const titleElement = document.querySelector("#page-title");
    const bishopStyle = getComputedStyle(bishopElement);
    const boardStyle = getComputedStyle(bishopElement, "::after");
    const titleStyle = getComputedStyle(titleElement);
    return {
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      intro: bounds(".intro"),
      title: bounds("#page-title"),
      titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
      titleRow: bounds(".intro-title-row"),
      lede: bounds(".intro .lede"),
      form: bounds(".search-form"),
      inputRow: bounds(".input-row"),
      bishop: bounds('[data-testid="intro-archive-bishop"]'),
      bishopStyle: {
        backgroundColor: bishopStyle.backgroundColor,
        backgroundImage: bishopStyle.backgroundImage,
        borderTopWidth: bishopStyle.borderTopWidth,
        boxShadow: bishopStyle.boxShadow,
      },
      boardStyle: {
        backgroundImage: boardStyle.backgroundImage,
        content: boardStyle.content,
      },
      image: {
        alt: image.alt,
        ariaHidden: bishopElement.getAttribute("aria-hidden"),
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        source: image.currentSrc,
        widthAttribute: image.getAttribute("width"),
        heightAttribute: image.getAttribute("height"),
      },
    };
  });

  assert.equal(layout.documentWidth, layout.clientWidth, "İlk ekranda yatay taşma olmamalı.");
  assert.ok(
    layout.title.left >= layout.intro.left - 0.5 && layout.title.right <= layout.intro.right + 0.5,
    "Düşen Taşlar başlığı kırpılmamalı veya giriş alanından taşmamalı.",
  );
  assert.ok(
    layout.form.left >= layout.intro.left - 0.5 && layout.form.right <= layout.intro.right + 0.5,
    "Kullanıcı adı formu giriş alanından taşmamalı.",
  );
  assert.ok(
    layout.inputRow.left >= layout.intro.left - 0.5
      && layout.inputRow.right <= layout.intro.right + 0.5,
    "Form satırı ekran dışına taşmamalı.",
  );
  assert.ok(
    layout.bishop.left >= layout.intro.left - 0.5
      && layout.bishop.right <= layout.intro.right + 0.5,
    "Arşivci Fil giriş alanından taşmamalı.",
  );
  assert.ok(
    layout.title.right <= layout.bishop.left + 0.5,
    "Başlık ile Arşivci Fil çakışmamalı.",
  );
  assert.ok(
    layout.title.height <= layout.titleLineHeight * 1.1,
    "Başlık dar ekranda okunaklı tek satırını korumalı.",
  );
  assert.ok(
    Math.abs(layout.title.bottom - layout.bishop.bottom) < 1,
    "Arşivci Fil başlığın alt hizasında durmalı.",
  );
  assert.ok(
    layout.form.top - layout.lede.bottom <= 32,
    "Form, açıklamadan sonra gereksiz boşluk olmadan devam etmeli.",
  );
  const expectedRange = viewport.width <= 700 ? [75, 90] : [120, 140];
  assert.ok(
    layout.bishop.width >= expectedRange[0] && layout.bishop.width <= expectedRange[1],
    `Arşivci Fil ${expectedRange[0]}–${expectedRange[1]} px aralığında olmalı.`,
  );
  assert.ok(
    Math.abs(layout.bishop.width - layout.bishop.height) < 1,
    "Arşivci Fil yükleme öncesinde kare alan ayırmalı.",
  );
  assert.equal(layout.bishopStyle.backgroundColor, "rgba(0, 0, 0, 0)");
  assert.equal(layout.bishopStyle.backgroundImage, "none");
  assert.equal(layout.bishopStyle.borderTopWidth, "0px");
  assert.equal(layout.bishopStyle.boxShadow, "none");
  assert.notEqual(layout.boardStyle.content, "none", "CSS satranç zemini bulunmalı.");
  assert.match(layout.boardStyle.backgroundImage, /conic-gradient/u);
  assert.equal(layout.image.alt, "", "Dekoratif Arşivci Fil boş alt metin taşımalı.");
  assert.equal(layout.image.ariaHidden, "true", "Dekoratif vinyet ekran okuyucudan gizlenmeli.");
  assert.equal(layout.image.complete, true, "Arşivci Fil görseli yüklenmeli.");
  assert.ok(layout.image.naturalWidth > 0 && layout.image.naturalHeight > 0);
  assert.equal(layout.image.objectFit, "contain", "Arşivci Fil kırpılmamalı.");
  assert.match(layout.image.source, /archive-bishop\.webp(?:\?|$)/u);
  assert.equal(layout.image.widthAttribute, "1254", "Görsel genişliği önceden ayrılmalı.");
  assert.equal(layout.image.heightAttribute, "1254", "Görsel yüksekliği önceden ayrılmalı.");
  return layout;
}

function installFakeWorkerHarness() {
  const state = {
    currentWorker: null,
    instances: [],
    scrollCalls: [],
  };
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  Element.prototype.scrollIntoView = function scrollIntoView(options) {
    state.scrollCalls.push({
      testId: this.getAttribute("data-testid"),
      className: typeof this.className === "string" ? this.className : null,
      behavior: options?.behavior ?? null,
      block: options?.block ?? null,
    });
    return originalScrollIntoView.call(this, options);
  };

  class FakeWorker {
    constructor(url, options) {
      this.url = String(url);
      this.options = options;
      this.onmessage = null;
      this.onerror = null;
      this.onmessageerror = null;
      this.lastMessage = null;
      this.terminated = false;
      state.currentWorker = this;
      state.instances.push(this);
    }

    postMessage(message) {
      this.lastMessage = message;
    }

    terminate() {
      this.terminated = true;
    }
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: FakeWorker,
  });

  globalThis.__DUSEN_TASLAR_WORKER_TEST__ = {
    emit(message) {
      const worker = state.currentWorker;
      if (!worker || worker.terminated || typeof worker.onmessage !== "function") {
        throw new Error("Mesaj alabilecek etkin sahte Worker bulunamadı.");
      }
      const data = {
        ...message,
        scanId: message.scanId ?? worker.lastMessage?.scanId ?? null,
      };
      queueMicrotask(() => worker.onmessage?.({ data }));
    },
    snapshot() {
      const worker = state.currentWorker;
      return {
        instanceCount: state.instances.length,
        currentTerminated: worker?.terminated ?? null,
        lastMessage: worker?.lastMessage ?? null,
        scrollCalls: state.scrollCalls.map((call) => ({ ...call })),
      };
    },
  };
}

async function inspectViewport(origin, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ key, record }) => localStorage.setItem(key, JSON.stringify(record)),
    { key: cacheKey, record: fixtureRecord },
  );

  const page = await context.newPage();
  const diagnostics = watchPage(page);

  await page.goto(origin, { waitUntil: "networkidle" });
  await assertBranding(page);
  const introLayout = await inspectIntroArchiveBishop(page, viewport);
  let introScreenshot = null;
  if (viewport.screenshot) {
    introScreenshot = path.join(outputDirectory, `${viewport.name}-intro.png`);
    await page.screenshot({ path: introScreenshot });
  }
  await page.locator("#username").fill("Hiy-Z");
  await page.getByRole("button", { name: "Tüm kariyeri tara" }).click();
  const resultPanel = page.getByTestId("result");
  await resultPanel.waitFor({ state: "visible" });
  assert.equal(await page.locator(".intro").count(), 0, "Sonuçta giriş markası ve form gizlenmeli.");
  assert.equal(await page.locator("#username").count(), 0, "Sonuçta kullanıcı adı alanı görünmemeli.");
  await page.getByText("KARİYER TARAMASI TAMAMLANDI", { exact: true }).waitFor();
  await page.getByText(/Son kayıt:/u).waitFor();
  const resultSpacing = await page.evaluate(() => ({
    panelMarginTop: Number.parseFloat(getComputedStyle(document.querySelector(".result-panel")).marginTop),
    shellPaddingTop: Number.parseFloat(getComputedStyle(document.querySelector(".page-shell")).paddingTop),
  }));
  assert.equal(resultSpacing.panelMarginTop, 0, "Sonuç kartının üstünde eski form boşluğu kalmamalı.");
  assert.ok(resultSpacing.shellPaddingTop <= 32, "Sonuç görünümü doğrudan kontrollerle başlamalı.");
  assert.equal(
    (await page.locator("#result-title").textContent())?.trim(),
    "Hiy-Z",
    "Arayüz forma yazılan kullanıcı adının büyük-küçük harflerini korumalı.",
  );
  await page.getByText("KARİYERİNİN GERİDE BIRAKTIKLARI", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Düşen taşların", exact: true }).waitFor();

  await assertFormattedValue(page, "total-games", "5.109");
  await assertFormattedValue(page, "total-losses", "37.923");
  await assertFormattedValue(page, "loss-pawn", "16.103");
  await assertFormattedValue(page, "loss-knight", "8.058");
  await assertFormattedValue(page, "loss-bishop", "6.911");
  await assertFormattedValue(page, "loss-rook", "4.407");
  await assertFormattedValue(page, "loss-queen", "2.444");

  await assert.doesNotReject(() => page.getByText("Şah", { exact: true }).waitFor());
  await assert.doesNotReject(() => page.getByText("0 kayıp", { exact: true }).waitFor());
  await assert.doesNotReject(() =>
    page.getByText("Sen kaybetsen de o düşmez.", { exact: true }).waitFor(),
  );

  const careerSection = page.getByTestId("career-records");
  await careerSection.scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".career-record-card__media img")].every(
      (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
    ),
  );
  await assert.doesNotReject(() =>
    page.getByRole("heading", { name: "Unutulmayan üç savaş" }).waitFor(),
  );
  await assert.doesNotReject(() =>
    page.getByText("14 taş kaybettin, yine de kazandın.", { exact: true }).waitFor(),
  );
  await assert.doesNotReject(() =>
    page.getByText("6 piyon · 2 at · 2 fil · 2 kale · 2 vezir", { exact: true }).waitFor(),
  );
  await assert.doesNotReject(() => page.getByText("76 hamle sürdü.", { exact: true }).waitFor());
  await assert.doesNotReject(() => page.getByText("Kaybettin", { exact: true }).waitFor());
  await assert.doesNotReject(() => page.getByText("6 hamlede mat.", { exact: true }).waitFor());
  await assertFormattedValue(page, "career-badge-queen-loss-wins", "1.027");
  await assertFormattedValue(page, "career-badge-flawless-wins", "30");
  await page.getByText("Vezir kaybıyla zafer", { exact: true }).waitFor();
  await page.getByText("Kayıpsız zafer", { exact: true }).waitFor();

  const posterButton = page.getByRole("button", { name: "Kariyer kartını hazırla" });
  await posterButton.waitFor({ state: "visible" });
  assert.equal(
    await posterButton.evaluate((button) =>
      button.parentElement?.previousElementSibling?.matches('[data-testid="career-records"]')
        ?? false),
    true,
    "Poster düğmesi Kariyer Kayıtları bölümünden sonraki kendi alanında bulunmalı.",
  );

  let posterModalScreenshot = null;
  let downloadedPoster = null;
  if (viewport.width === 390 || viewport.width === 1_440) {
    await posterButton.click();
    const dialog = page.getByRole("dialog", { name: "Kariyer kartın" });
    await dialog.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const poster = document.querySelector('.career-poster-dialog [data-testid="career-poster-canvas"]');
      const images = poster ? [...poster.querySelectorAll("img")] : [];
      return images.length === 9
        && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    });
    assert.equal(await dialog.getByTestId("career-poster-username").textContent(), "Hiy-Z");
    assert.equal(await dialog.getByTestId("career-poster-total-games").textContent(), "5.109");
    assert.equal(await dialog.getByTestId("career-poster-total-losses").textContent(), "37.923");
    assert.equal(await dialog.getByTestId("career-poster-record-bloodiest").textContent(), "14 taş");
    assert.equal(await dialog.getByTestId("career-poster-record-longest").textContent(), "76 hamle");
    assert.equal(await dialog.getByTestId("career-poster-record-fastest").textContent(), "6 hamle");
    await dialog.getByText("OYUNCU", { exact: true }).waitFor();
    await dialog.getByText("10 Ağustos 2026", { exact: true }).waitFor();

    const modalLayout = await page.evaluate(() => {
      const dialogElement = document.querySelector(".career-poster-dialog");
      const preview = dialogElement.querySelector(".career-poster-dialog__preview");
      const poster = dialogElement.querySelector('[data-testid="career-poster-canvas"]');
      const dialogRect = dialogElement.getBoundingClientRect();
      const posterStyle = getComputedStyle(poster);
      return {
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        dialogLeft: dialogRect.left,
        dialogRight: dialogRect.right,
        previewScrollWidth: preview.scrollWidth,
        previewClientWidth: preview.clientWidth,
        posterCssWidth: Number.parseFloat(posterStyle.width),
        posterCssHeight: Number.parseFloat(posterStyle.height),
      };
    });
    assert.equal(modalLayout.documentWidth, modalLayout.clientWidth, "Poster modalı yatay taşma üretmemeli.");
    assert.ok(modalLayout.dialogLeft >= 0 && modalLayout.dialogRight <= viewport.width + 0.5);
    assert.equal(modalLayout.previewScrollWidth, modalLayout.previewClientWidth, "Poster ön izlemesi paneli taşırmamalı.");
    assert.equal(modalLayout.posterCssWidth, 1_080, "Modal içindeki gerçek poster 1080 px kalmalı.");
    assert.equal(modalLayout.posterCssHeight, 1_350, "Modal içindeki gerçek poster 1350 px kalmalı.");

    posterModalScreenshot = path.join(outputDirectory, `${viewport.name}-poster-modal.png`);
    await page.screenshot({ path: posterModalScreenshot });

    if (viewport.width === 390) {
      const downloadEvent = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "PNG indir" }).click();
      await dialog.getByRole("button", { name: "Kart hazırlanıyor…" }).waitFor({ state: "visible" });
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), "dusen-taslar-hiy-z.png");
      const downloadPath = path.join(outputDirectory, download.suggestedFilename());
      await download.saveAs(downloadPath);
      assert.deepEqual(
        await pngDimensions(downloadPath),
        { width: 1_080, height: 1_350 },
        "Gerçek indirilen PNG tam poster ölçüsünde olmalı.",
      );
      await dialog.getByRole("button", { name: "PNG indir" }).waitFor({ state: "visible" });
      downloadedPoster = downloadPath;
      await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
    } else {
      await page.keyboard.press("Escape");
    }

    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() =>
      document.activeElement?.textContent?.trim() === "Kariyer kartını hazırla",
    );
    assert.equal(
      await posterButton.evaluate((button) => document.activeElement === button),
      true,
      "Modal kapanınca klavye odağı açma düğmesine dönmeli.",
    );
  }

  const archiveBishopCard = page.locator(".archive-bishop-card");
  await archiveBishopCard.scrollIntoViewIfNeeded();
  await archiveBishopCard.getByText("KAYDIN NASIL HAZIRLANDI?", { exact: true }).waitFor();
  await archiveBishopCard
    .getByRole("heading", { name: "Arşivci Fil kayıtlarını inceledi.", exact: true })
    .waitFor();
  await archiveBishopCard.getByText(
    "Herkese açık standart maçların bu cihazda tarandı. Hamleler yeniden oynatıldı ve yalnızca tahtada gerçekten alınan taşların sayıldı. Ham maç verilerin sunucumuza gönderilmedi.",
    { exact: true },
  ).waitFor();
  const archiveBishopImage = archiveBishopCard.locator("img");
  await page.waitForFunction(() => {
    const image = document.querySelector(".archive-bishop-card img");
    return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  });
  const archiveBishop = await archiveBishopImage.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return {
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: getComputedStyle(image).objectFit,
      source: image.currentSrc,
      width: rect.width,
      contentWidth: document.querySelector(".archive-bishop-card__content")
        ?.getBoundingClientRect().width ?? 0,
    };
  });
  assert.equal(archiveBishop.complete, true, "Arşivci Fil görseli yüklenmeli.");
  assert.ok(
    archiveBishop.naturalWidth > 0 && archiveBishop.naturalHeight > 0,
    "Arşivci Fil geçerli bir görsel olmalı.",
  );
  assert.match(archiveBishop.source, /archive-bishop\.webp(?:\?|$)/u);
  assert.equal(archiveBishop.objectFit, "contain", "Arşivci Fil kırpılmamalı.");
  assert.ok(archiveBishop.alt.trim(), "Arşivci Fil anlamlı alt metin taşımalı.");
  assert.ok(
    archiveBishop.width >= 109 && archiveBishop.width <= 141,
    "Arşivci Fil yaklaşık 110–140 px genişliğinde kalmalı.",
  );
  assert.ok(archiveBishop.contentWidth >= 220, "Arşivci Fil metin alanı sıkışmamalı.");
  assert.equal(
    await archiveBishopCard.evaluate((card) =>
      card.nextElementSibling?.classList.contains("result-notes") ?? false),
    true,
    "Arşivci Fil kartı Teknik ayrıntılar bölümünden hemen önce olmalı.",
  );

  for (const expected of careerRecordExpectations) {
    const card = page.getByTestId(expected.testId);
    const link = card.locator("a.career-record-link");
    assert.equal(await link.getAttribute("href"), expected.url, "Maç bağlantısı fixture URL'sini kullanmalı.");
    assert.equal(await link.getAttribute("target"), "_blank", "Maç bağlantısı yeni sekmede açılmalı.");
    const rel = (await link.getAttribute("rel"))?.split(/\s+/) ?? [];
    assert.ok(rel.includes("noopener"), "Maç bağlantısı noopener içermeli.");
    assert.ok(rel.includes("noreferrer"), "Maç bağlantısı noreferrer içermeli.");
  }
  const firstCareerLink = page
    .getByTestId(careerRecordExpectations[0].testId)
    .locator("a.career-record-link");
  await page.getByRole("button", { name: "Geri dön" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await firstCareerLink.evaluate((link) => document.activeElement === link),
    true,
    "İlk maç bağlantısına klavyeyle ulaşılmalı.",
  );
  const focusOutline = await firstCareerLink.evaluate((link) => {
    const style = getComputedStyle(link);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  assert.notEqual(focusOutline.style, "none", "Maç bağlantısının görünür klavye odağı olmalı.");
  assert.ok(focusOutline.width >= 3, "Maç bağlantısının klavye odağı en az 3 px olmalı.");

  const layout = await page.evaluate(() => {
    const rectangle = (selector) => {
      const element = document.querySelector(selector);
      assertElement(element, selector);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right };
    };
    const assertElement = (element, selector) => {
      if (!element) {
        throw new Error(`Beklenen öğe bulunamadı: ${selector}`);
      }
    };
    const watermark = (selector, pseudo, foregroundSelectors) => {
      const card = document.querySelector(selector);
      assertElement(card, selector);
      const cardRect = card.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      const pseudoStyle = getComputedStyle(card, pseudo);
      return {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        cardBackgroundImage: cardStyle.backgroundImage,
        overflow: cardStyle.overflow,
        cardBorderRadius: Number.parseFloat(cardStyle.borderTopLeftRadius),
        width: Number.parseFloat(pseudoStyle.width),
        height: Number.parseFloat(pseudoStyle.height),
        top: Number.parseFloat(pseudoStyle.top),
        right: Number.parseFloat(pseudoStyle.right),
        bottom: Number.parseFloat(pseudoStyle.bottom),
        transform: pseudoStyle.transform,
        backgroundImage: pseudoStyle.backgroundImage,
        backgroundSize: pseudoStyle.backgroundSize,
        borderWidth: Number.parseFloat(pseudoStyle.borderTopWidth),
        pseudoBorderRadius: Number.parseFloat(pseudoStyle.borderTopLeftRadius),
        boxShadow: pseudoStyle.boxShadow,
        maskImage: pseudoStyle.maskImage || pseudoStyle.webkitMaskImage,
        foregroundZIndexes: foregroundSelectors.map((foregroundSelector) => {
          const foreground = card.querySelector(foregroundSelector);
          assertElement(foreground, `${selector} ${foregroundSelector}`);
          return getComputedStyle(foreground).zIndex;
        }),
      };
    };
    const images = [...document.querySelectorAll(".honor-roll img")].map((image) => ({
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: getComputedStyle(image).objectFit,
    }));
    const cards = [...document.querySelectorAll(".king-card, .piece-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    const careerImages = [...document.querySelectorAll(".career-record-card__media img")].map(
      (image) => ({
        rect: (() => {
          const bounds = image.getBoundingClientRect();
          return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
        })(),
        mediaRect: (() => {
          const bounds = image.parentElement.getBoundingClientRect();
          return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
        })(),
        alt: image.alt,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        loading: image.loading,
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
      }),
    );
    const careerCards = [...document.querySelectorAll(".career-record-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    });
    const careerMedia = [...document.querySelectorAll(".career-record-card__media")].map((media) => {
      const rect = media.getBoundingClientRect();
      return { height: rect.height };
    });
    const careerTotals = [...document.querySelectorAll(".career-totals dd")].map((value) => {
      const style = getComputedStyle(value);
      const rect = value.getBoundingClientRect();
      return {
        whiteSpace: style.whiteSpace,
        height: rect.height,
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    const pieceCounts = [...document.querySelectorAll(".piece-card__count strong")].map((value) => {
      const rect = value.getBoundingClientRect();
      const cardRect = value.closest(".piece-card").getBoundingClientRect();
      return {
        whiteSpace: getComputedStyle(value).whiteSpace,
        left: rect.left,
        right: rect.right,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
      };
    });
    const careerBadges = [...document.querySelectorAll(".career-record-badges > div")].map(
      (card) => {
        const cardRect = card.getBoundingClientRect();
        const labelRect = card.querySelector("dt").getBoundingClientRect();
        const value = card.querySelector("dd");
        const valueRect = value.getBoundingClientRect();
        return {
          top: cardRect.top,
          labelBottom: labelRect.bottom,
          valueTop: valueRect.top,
          valueWhiteSpace: getComputedStyle(value).whiteSpace,
        };
      },
    );
    const resultTitle = document.querySelector("#result-title");
    const resultIdentity = document.querySelector(".result-identity");
    assertElement(resultTitle, "#result-title");
    assertElement(resultIdentity, ".result-identity");
    const resultTitleRect = resultTitle.getBoundingClientRect();
    const resultIdentityRect = resultIdentity.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      images,
      cards,
      careerImages,
      careerCards,
      careerMedia,
      careerTotals,
      pieceCounts,
      careerBadges,
      resultTitle: {
        left: resultTitleRect.left,
        right: resultTitleRect.right,
        containerLeft: resultIdentityRect.left,
        containerRight: resultIdentityRect.right,
      },
      summaryWatermark: watermark(
        ".result-hero",
        "::after",
        [".result-identity", ".career-totals"],
      ),
      pawnWatermark: watermark(
        ".piece-card--pawn",
        "::before",
        [".piece-card__content", ".piece-card__media"],
      ),
      otherPieceWatermarks: [...document.querySelectorAll(
        ".king-card, .piece-grid .piece-card",
      )].map((card) => ({
        before: getComputedStyle(card, "::before").backgroundImage,
        after: getComputedStyle(card, "::after").backgroundImage,
      })),
      king: rectangle(".king-card"),
      pawn: rectangle(".piece-card--pawn"),
      knight: rectangle(".piece-card--knight"),
      bishop: rectangle(".piece-card--bishop"),
      rook: rectangle(".piece-card--rook"),
      queen: rectangle(".piece-card--queen"),
    };
  });

  assert.equal(layout.images.length, 6, "Şah dahil altı taş görseli gösterilmeli.");
  for (const image of layout.images) {
    assert.equal(image.complete, true, "Taş görseli yüklenmiş olmalı.");
    assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0, "Taş görseli geçerli olmalı.");
    assert.equal(image.objectFit, "contain", "Taş görselleri kırpılmamalı.");
    assert.ok(image.alt.trim(), "Her taş görselinin erişilebilir alt metni olmalı.");
  }
  assert.equal(layout.careerImages.length, 3, "Üç kariyer kaydı görseli gösterilmeli.");
  for (const image of layout.careerImages) {
    assert.equal(image.complete, true, "Kariyer kaydı görseli yüklenmiş olmalı.");
    assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0, "Kariyer görseli geçerli olmalı.");
    assert.equal(image.objectFit, "contain", "Kariyer görselleri kırpılmamalı.");
    assert.equal(image.loading, "lazy", "Kariyer görselleri lazy yüklenmeli.");
    assert.equal(image.width, "1254", "Kariyer görseli için kaynak genişliği ayrılmalı.");
    assert.equal(image.height, "1254", "Kariyer görseli için kaynak yüksekliği ayrılmalı.");
    assert.ok(image.alt.trim(), "Kariyer görselinin anlamlı alt metni olmalı.");
    assert.ok(
      image.rect.top >= image.mediaRect.top - 0.5
        && image.rect.right <= image.mediaRect.right + 0.5
        && image.rect.bottom <= image.mediaRect.bottom + 0.5
        && image.rect.left >= image.mediaRect.left - 0.5,
      "Kariyer görseli ayrılan medya alanının dışına taşmamalı.",
    );
  }
  assert.equal(layout.documentWidth, layout.clientWidth, "Sayfada yatay taşma olmamalı.");
  for (const [name, watermark] of [
    ["Kariyer özeti", layout.summaryWatermark],
    ["Piyon", layout.pawnWatermark],
  ]) {
    assert.equal(watermark.cardBackgroundImage, "none", `${name} kartındaki eski daire kaldırılmalı.`);
    assert.equal(watermark.overflow, "hidden", `${name} filigranı kart köşelerinden taşmamalı.`);
    assert.ok(watermark.cardBorderRadius > 0, `${name} kartının yuvarlatılmış köşeleri korunmalı.`);
    assert.match(watermark.backgroundImage, /conic-gradient/u, `${name} filigranı karelerden oluşmalı.`);
    assert.notEqual(watermark.maskImage, "none", `${name} filigranı kenarlara doğru solmalı.`);
    assert.equal(watermark.borderWidth, 0, `${name} filigranında eski daire çerçevesi kalmamalı.`);
    assert.equal(watermark.pseudoBorderRadius, 0, `${name} filigranı dairesel olmamalı.`);
    assert.equal(watermark.boxShadow, "none", `${name} filigranında eski yay gölgesi kalmamalı.`);
    assert.ok(
      watermark.foregroundZIndexes.every((zIndex) => Number(zIndex) >= 1),
      `${name} içeriği filigranın önünde kalmalı.`,
    );
  }
  assert.ok(
    Math.abs(layout.summaryWatermark.width - layout.summaryWatermark.height) < 1,
    "Kariyer özeti filigranı yaklaşık 6×6 olmalı.",
  );
  assert.ok(
    Math.abs(layout.pawnWatermark.height - layout.pawnWatermark.cardHeight) <= 3,
    "Piyon filigranı kartın bütün yüksekliğini kullanmalı.",
  );
  assert.equal(layout.pawnWatermark.top, 0, "Piyon filigranı kartın üst kenarına dayanmalı.");
  assert.equal(layout.pawnWatermark.right, 0, "Piyon filigranı kartın sağ kenarına dayanmalı.");
  assert.equal(layout.pawnWatermark.bottom, 0, "Piyon filigranı kartın alt kenarına dayanmalı.");
  assert.equal(layout.pawnWatermark.transform, "none", "Piyon filigranı dikey merkezleme dönüşümü kullanmamalı.");
  const pawnTileDimensions = layout.pawnWatermark.backgroundSize
    .match(/[\d.]+px/gu)
    ?.map((value) => Number.parseFloat(value)) ?? [];
  assert.equal(pawnTileDimensions.length, 2, "Piyon filigranının iki karo ölçüsü bulunmalı.");
  assert.ok(
    Math.abs(pawnTileDimensions[0] - pawnTileDimensions[1]) < 0.1,
    "Piyon filigranındaki hücreler kare kalmalı.",
  );
  assert.match(
    layout.pawnWatermark.maskImage,
    /linear-gradient\(to right/u,
    "Piyon filigranı yalnız sola doğru yumuşakça kaybolmalı.",
  );
  const pawnWatermarkCoverage = layout.pawnWatermark.width / layout.pawnWatermark.cardWidth;
  const expectedPawnCoverage = viewport.width <= 700 ? [0.48, 0.55] : [0.4, 0.45];
  assert.ok(
    pawnWatermarkCoverage >= expectedPawnCoverage[0]
      && pawnWatermarkCoverage <= expectedPawnCoverage[1],
    "Piyon filigranı kartın yalnızca hedeflenen sağ bölümünde kalmalı.",
  );
  assert.ok(
    layout.otherPieceWatermarks.every(
      ({ before, after }) => before === "none" && after === "none",
    ),
    "Şah, at, fil, kale ve vezir kartlarına kare deseni eklenmemeli.",
  );
  assert.ok(
    layout.resultTitle.left >= layout.resultTitle.containerLeft - 0.5
      && layout.resultTitle.right <= layout.resultTitle.containerRight + 0.5,
    "Kullanıcı adı sonuç kartından yatay taşmamalı.",
  );
  for (const total of layout.careerTotals) {
    assert.equal(total.whiteSpace, "nowrap", "Kariyer toplamı satır ortasında bölünmemeli.");
    assert.ok(
      !Number.isFinite(total.lineHeight) || total.height <= total.lineHeight * 1.15,
      "Kariyer toplamı tek satırda kalmalı.",
    );
  }
  for (const count of layout.pieceCounts) {
    assert.equal(count.whiteSpace, "nowrap", "Taş kaybı sayısı satır ortasında bölünmemeli.");
    assert.ok(
      count.left >= count.cardLeft - 0.5 && count.right <= count.cardRight + 0.5,
      "Taş kaybı sayısı kartından taşmamalı.",
    );
  }
  assert.equal(layout.careerBadges.length, 2, "İki küçük kariyer istatistiği bulunmalı.");
  for (const badge of layout.careerBadges) {
    assert.ok(
      badge.valueTop >= badge.labelBottom - 0.5,
      "Kariyer istatistiğinde küçük açıklama büyük sayının üstünde olmalı.",
    );
    assert.equal(badge.valueWhiteSpace, "nowrap", "Kariyer rozeti sayısı bölünmemeli.");
  }
  if (viewport.width < 360) {
    assert.ok(
      layout.careerBadges[0].top < layout.careerBadges[1].top,
      "360 px altında kariyer istatistikleri alt alta gelmeli.",
    );
  } else {
    assert.ok(
      Math.abs(layout.careerBadges[0].top - layout.careerBadges[1].top) < 1,
      "360 px ve üstünde kariyer istatistikleri yan yana kalmalı.",
    );
  }
  for (const card of layout.cards) {
    assert.ok(card.left >= -0.5 && card.right <= viewport.width + 0.5, "Kart ekrandan taşmamalı.");
  }
  for (const card of layout.careerCards) {
    assert.ok(card.left >= -0.5 && card.right <= viewport.width + 0.5, "Kariyer kartı ekrandan taşmamalı.");
  }
  assert.ok(layout.king.width > layout.king.height * 2, "Şah kartı yatay kalmalı.");

  if (viewport.width <= 390) {
    assert.ok(Math.abs(layout.pawn.width - layout.king.width) < 1, "Piyon kartı tam genişlikte olmalı.");
    assert.ok(Math.abs(layout.knight.y - layout.bishop.y) < 1, "At ve fil aynı satırda olmalı.");
    assert.ok(Math.abs(layout.rook.y - layout.queen.y) < 1, "Kale ve vezir aynı satırda olmalı.");
    assert.ok(layout.knight.width < layout.pawn.width, "Mobil taş kartları iki kolon olmalı.");
    assert.ok(
      layout.careerCards[0].top < layout.careerCards[1].top
        && layout.careerCards[1].top < layout.careerCards[2].top,
      "Mobilde kariyer kartları tek sütunda sıralanmalı.",
    );
    assert.ok(
      layout.careerMedia.every((media) => media.height >= 132 && media.height <= 140),
      "Mobil kariyer görsel alanları yaklaşık yüzde 15–20 daha kısa olmalı.",
    );
  } else {
    const officerRows = [layout.knight.y, layout.bishop.y, layout.rook.y, layout.queen.y];
    assert.ok(
      Math.max(...officerRows) - Math.min(...officerRows) < 1,
      "Masaüstünde dört taş kartı aynı satırda olmalı.",
    );
    const careerRows = layout.careerCards.map((card) => card.top);
    assert.ok(
      Math.max(...careerRows) - Math.min(...careerRows) < 1,
      "Masaüstünde üç kariyer kartı aynı satırda olmalı.",
    );
  }

  const technicalDetails = page.locator("details.technical-details");
  assert.equal(await technicalDetails.getAttribute("open"), null, "Teknik ayrıntılar kapalı başlamalı.");
  const summary = technicalDetails.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  assert.notEqual(await technicalDetails.getAttribute("open"), null, "Teknik ayrıntılar Enter ile açılmalı.");
  await page.keyboard.press("Enter");
  assert.equal(await technicalDetails.getAttribute("open"), null, "Teknik ayrıntılar Enter ile kapanmalı.");

  const rescan = page.getByRole("button", { name: "Yeniden tara" });
  const back = page.getByRole("button", { name: "Geri dön" });
  assert.equal(await rescan.isEnabled(), true, "Yeniden tara düğmesi kullanılabilir olmalı.");
  assert.equal(await back.isEnabled(), true, "Geri dön düğmesi kullanılabilir olmalı.");

  let viewportScreenshot = null;
  let resultScreenshot = null;
  let summaryWatermarkScreenshot = null;
  let pawnWatermarkScreenshot = null;
  if (viewport.screenshot) {
    summaryWatermarkScreenshot = path.join(
      outputDirectory,
      `${viewport.name}-summary-watermark.png`,
    );
    pawnWatermarkScreenshot = path.join(
      outputDirectory,
      `${viewport.name}-pawn-watermark.png`,
    );
    await page.locator(".result-hero").screenshot({ path: summaryWatermarkScreenshot });
    await page.locator(".piece-card--pawn").screenshot({ path: pawnWatermarkScreenshot });
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.querySelector('[data-testid="career-records"]')?.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(50);
    viewportScreenshot = path.join(outputDirectory, `${viewport.name}.png`);
    resultScreenshot = path.join(outputDirectory, `${viewport.name}-result.png`);
    await page.screenshot({ path: viewportScreenshot });
    await resultPanel.screenshot({ path: resultScreenshot });
  }

  await back.click();
  const returnedUsername = page.locator("#username");
  await returnedUsername.waitFor({ state: "visible" });
  assert.equal(await returnedUsername.inputValue(), "Hiy-Z", "Geri dönüş son kullanıcı adını korumalı.");
  assert.equal(await resultPanel.count(), 0, "Geri dönüşte sonuç görünümü kapanmalı.");
  await page.getByRole("heading", { level: 1, name: "Düşen Taşlar" }).waitFor();
  await page.getByRole("button", { name: "Tüm kariyeri tara" }).waitFor();
  assert.equal(
    await returnedUsername.evaluate((input) => document.activeElement === input),
    true,
    "Geri dönüşte klavye odağı kullanıcı adı alanına gelmeli.",
  );

  assertCleanPage(diagnostics, `${viewport.name} sonuç görünümü`);

  await context.close();
  return {
    viewport: { width: viewport.width, height: viewport.height },
    viewportScreenshot,
    resultScreenshot,
    summaryWatermarkScreenshot,
    pawnWatermarkScreenshot,
    documentWidth: layout.documentWidth,
    clientWidth: layout.clientWidth,
    imageCount: layout.images.length,
    careerImageCount: layout.careerImages.length,
    introBishopWidth: introLayout.bishop.width,
    introScreenshot,
    posterModalScreenshot,
    downloadedPoster,
  };
}

async function inspectCachedState(origin, username, cachedResult, inspect) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const key = `satranc-mezarligi:history-result:${username.toLocaleLowerCase("en-US")}`;
  const record = { ...fixtureRecord, result: cachedResult };
  await context.addInitScript(
    ({ cacheKey: scenarioKey, cacheRecord }) =>
      localStorage.setItem(scenarioKey, JSON.stringify(cacheRecord)),
    { cacheKey: key, cacheRecord: record },
  );

  const page = await context.newPage();
  const diagnostics = watchPage(page);

  await page.goto(origin, { waitUntil: "networkidle" });
  await assertBranding(page);
  await page.locator("#username").fill(username);
  await page.getByRole("button", { name: "Tüm kariyeri tara" }).click();
  await page.getByTestId("result").waitFor({ state: "visible" });
  await inspect(page);

  const widths = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.equal(widths.documentWidth, widths.clientWidth, "Eksik veri ekranı yatay taşmamalı.");
  assertCleanPage(diagnostics, `${username} eski/eksik cache görünümü`);

  await context.close();
}

async function inspectCompatibilityStates(origin) {
  const {
    careerRecords: _omittedCareerRecords,
    displayUsername: _omittedDisplayUsername,
    ...legacyBase
  } = result;
  const legacyResult = { ...legacyBase, username: "legacy-user" };
  await inspectCachedState(origin, "Legacy-User", legacyResult, async (page) => {
    assert.equal(
      (await page.locator("#result-title").textContent())?.trim(),
      "Legacy-User",
      "displayUsername içermeyen eski cache girilen kullanıcı adı yazımını kullanmalı.",
    );
    const fallback = page.getByTestId("career-records-fallback");
    await fallback.getByText(
      "Kariyer kayıtlarını görmek için hesabını yeniden tara.",
      { exact: true },
    ).waitFor();
    assert.equal(
      await fallback.getByRole("button", { name: "Yeniden tara" }).isEnabled(),
      true,
      "Eski cache ekranındaki yeniden tara düğmesi etkin olmalı.",
    );
    assert.equal(await page.getByTestId("career-records").count(), 0);
    await page.getByRole("button", { name: "Kariyer kartını hazırla" }).click();
    const dialog = page.getByRole("dialog", { name: "Kariyer kartın" });
    await dialog.waitFor({ state: "visible" });
    assert.equal(
      await dialog.getByText("Kayıt bulunamadı", { exact: true }).count(),
      3,
      "Eski cache posterde eksik üç kaydı güvenle göstermeli.",
    );
    await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
  });

  const incompleteResult = {
    ...result,
    username: "Null-User",
    displayUsername: "Null-User",
    careerRecords: {
      ...result.careerRecords,
      bloodiestWin: {
        ...result.careerRecords.bloodiestWin,
        opponent: { username: "Pauloxdrz", rating: null },
        endTime: null,
      },
      fastestCheckmate: null,
    },
  };
  await inspectCachedState(origin, "Null-User", incompleteResult, async (page) => {
    const section = page.getByTestId("career-records");
    await section.scrollIntoViewIfNeeded();
    assert.equal(await section.locator(".career-record-card").count(), 3);
    const emptyCard = page.getByTestId("career-record-fastestCheckmate");
    await emptyCard.getByText("Bu kayıt için uygun maç bulunamadı.", { exact: true }).waitFor();
    assert.equal(await emptyCard.locator("a").count(), 0, "Null kayıtta maç bağlantısı olmamalı.");
    assert.equal(await page.getByTestId("career-record-bloodiestWin").locator("a").count(), 1);
    assert.equal(await page.getByTestId("career-record-longestBattle").locator("a").count(), 1);
    const metadata = await page
      .getByTestId("career-record-bloodiestWin")
      .locator(".career-record-card__metadata")
      .innerText();
    assert.doesNotMatch(metadata, /·\s*·/, "Eksik metadata boş ayraç üretmemeli.");
  });

  return { legacyWithoutCareerRecords: true, nullRecord: true };
}

async function fakeWorkerSnapshot(page) {
  return page.evaluate(() => globalThis.__DUSEN_TASLAR_WORKER_TEST__?.snapshot());
}

async function emitFakeWorkerMessage(page, message) {
  await page.evaluate(
    (workerMessage) => globalThis.__DUSEN_TASLAR_WORKER_TEST__.emit(workerMessage),
    message,
  );
}

async function waitForScrollCall(page, testId, behavior) {
  await page.waitForFunction(
    ({ expectedTestId, expectedBehavior }) =>
      globalThis.__DUSEN_TASLAR_WORKER_TEST__
        ?.snapshot()
        .scrollCalls
        .some((call) => call.testId === expectedTestId && call.behavior === expectedBehavior),
    { expectedTestId: testId, expectedBehavior: behavior },
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const widths = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.equal(widths.documentWidth, widths.clientWidth, `${label}: yatay taşma olmamalı.`);
  return widths;
}

async function inspectCourier(page, { reducedMotion, expectedWidth }) {
  const courier = page.getByTestId("archive-courier");
  await courier.waitFor({ state: "visible" });
  const image = courier.locator("img");
  await page.waitForFunction(() => {
    const courierImage = document.querySelector('[data-testid="archive-courier"] img');
    return courierImage?.complete
      && courierImage.naturalWidth > 0
      && courierImage.naturalHeight > 0;
  });

  const state = await courier.evaluate((element) => {
    const courierImage = element.querySelector("img");
    const route = element.closest(".progress-route");
    const rect = element.getBoundingClientRect();
    const routeRect = route.getBoundingClientRect();
    return {
      ariaHidden: element.getAttribute("aria-hidden"),
      animationName: getComputedStyle(element).animationName,
      imageAnimationName: getComputedStyle(courierImage).animationName,
      animationStates: element
        .getAnimations({ subtree: true })
        .map((animation) => animation.playState),
      image: {
        alt: courierImage.alt,
        complete: courierImage.complete,
        naturalWidth: courierImage.naturalWidth,
        naturalHeight: courierImage.naturalHeight,
        objectFit: getComputedStyle(courierImage).objectFit,
        source: courierImage.currentSrc,
      },
      rect: { left: rect.left, right: rect.right, width: rect.width },
      routeRect: { left: routeRect.left, right: routeRect.right },
    };
  });

  assert.equal(state.ariaHidden, "true", "Arşiv Kuryesi ekran okuyucudan gizlenmeli.");
  assert.equal(state.image.alt, "", "Dekoratif Arşiv Kuryesi boş alt metin taşımalı.");
  assert.equal(state.image.complete, true, "Arşiv Kuryesi görseli yüklenmeli.");
  assert.ok(
    state.image.naturalWidth > 0 && state.image.naturalHeight > 0,
    "Arşiv Kuryesi geçerli bir görsel olmalı.",
  );
  assert.match(state.image.source, /archive-courier-knight-loading\.webp(?:\?|$)/u);
  assert.equal(state.image.objectFit, "contain", "Arşiv Kuryesi görseli kırpılmamalı.");
  assert.ok(
    Math.abs(state.rect.width - expectedWidth) <= 1,
    `Arşiv Kuryesi yaklaşık ${expectedWidth} px olmalı.`,
  );
  assert.ok(
    state.rect.left >= state.routeRect.left - 0.5 && state.rect.right <= state.routeRect.right + 0.5,
    "Arşiv Kuryesi ilerleme rotasından taşmamalı.",
  );

  if (reducedMotion) {
    assert.equal(state.animationName, "none", "Reduced-motion yatay kurye animasyonunu kapatmalı.");
    assert.equal(state.imageAnimationName, "none", "Reduced-motion koşu animasyonunu kapatmalı.");
    assert.deepEqual(state.animationStates, [], "Reduced-motion durumunda kurye sabit kalmalı.");
    return state;
  }

  assert.match(state.animationName, /archive-courier-route/u);
  assert.match(state.imageAnimationName, /archive-courier-stride/u);
  assert.ok(
    state.animationStates.length >= 2 && state.animationStates.every((value) => value === "running"),
    "Tarama sırasında kurye hareket ve yön animasyonları çalışmalı.",
  );

  const travel = await courier.evaluate(async (element) => {
    const courierImage = element.querySelector("img");
    const route = element.closest(".progress-route");
    const routeAnimation = element
      .getAnimations()
      .find((animation) => animation.animationName === "archive-courier-route");
    const strideAnimation = courierImage
      .getAnimations()
      .find((animation) => animation.animationName === "archive-courier-stride");
    if (!routeAnimation || !strideAnimation) {
      throw new Error("Kurye CSS animasyonları bulunamadı.");
    }

    routeAnimation.pause();
    strideAnimation.pause();
    const duration = Number(routeAnimation.effect.getComputedTiming().duration);
    routeAnimation.currentTime = 0;
    strideAnimation.currentTime = 0;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const left = element.getBoundingClientRect();

    routeAnimation.currentTime = duration / 2;
    strideAnimation.currentTime = duration / 2;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const right = element.getBoundingClientRect();
    const returnDirectionTransform = getComputedStyle(courierImage).transform;
    const routeRect = route.getBoundingClientRect();

    routeAnimation.play();
    strideAnimation.play();
    return {
      leftX: left.left,
      rightX: right.left,
      rightEdge: right.right,
      routeLeft: routeRect.left,
      routeRight: routeRect.right,
      returnDirectionTransform,
    };
  });
  assert.ok(travel.rightX > travel.leftX + expectedWidth, "Kurye çizginin sağına ilerlemeli.");
  assert.ok(
    travel.leftX >= travel.routeLeft - 0.5 && travel.rightEdge <= travel.routeRight + 0.5,
    "Kurye animasyonun uç noktalarında rotadan taşmamalı.",
  );
  assert.match(
    travel.returnDirectionTransform,
    /matrix\(-1|scaleX\(-1/u,
    "Kurye geri dönüşte gittiği yöne bakmalı.",
  );
  return state;
}

async function createWorkerHarnessPage(origin, { reducedMotion, width, height }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await context.addInitScript(installFakeWorkerHarness);
  const page = await context.newPage();
  const diagnostics = watchPage(page);
  await page.goto(origin, { waitUntil: "networkidle" });
  await assertBranding(page);
  return { context, page, diagnostics };
}

async function inspectAnimatedScanLifecycle(origin) {
  const { context, page, diagnostics } = await createWorkerHarnessPage(origin, {
    reducedMotion: false,
    width: 390,
    height: 844,
  });
  const input = page.locator("#username");
  const submit = page.getByRole("button", { name: "Tüm kariyeri tara" });
  await input.fill("  UgurCelik24  ");
  await submit.click();
  await page.getByTestId("progress-panel").waitFor({ state: "visible" });
  assert.equal(await input.isDisabled(), true, "Tarama sırasında kullanıcı adı alanı kilitlenmeli.");
  assert.equal(await submit.isDisabled(), true, "Tarama sırasında başlatma düğmesi kilitlenmeli.");
  await waitForScrollCall(page, "progress-panel", "smooth");
  await inspectCourier(page, { reducedMotion: false, expectedWidth: 56 });
  await assertNoHorizontalOverflow(page, "Hareketli tarama ekranı");

  const startSnapshot = await fakeWorkerSnapshot(page);
  assert.equal(startSnapshot.lastMessage?.type, "start");
  assert.equal(
    startSnapshot.lastMessage?.username,
    "UgurCelik24",
    "Worker kenar boşlukları temizlenmiş kullanıcı adını almalı.",
  );
  assert.ok(
    Number.isInteger(startSnapshot.lastMessage?.scanId)
      && startSnapshot.lastMessage.scanId > 0,
    "Worker başlangıç mesajı geçerli bir tarama kimliği taşımalı.",
  );

  await emitFakeWorkerMessage(page, {
    type: "progress",
    event: {
      type: "historyProgress",
      stage: "archiveCompleted",
      archives: { processed: 1, total: 2, current: { year: "2026", month: "01" } },
      games: { uniqueProcessed: 7 },
    },
  });
  await page.getByText("1 / 2 ay", { exact: true }).waitFor();
  await page.getByText("7 maç işlendi", { exact: true }).waitFor();

  const liveResult = {
    ...result,
    username: "ugurcelik24",
    displayUsername: "ugurcelik24",
  };
  await emitFakeWorkerMessage(page, { type: "result", result: liveResult });
  const resultPanel = page.getByTestId("result");
  await resultPanel.waitFor({ state: "visible" });
  await waitForScrollCall(page, "result", "smooth");
  assert.equal(
    (await page.locator("#result-title").textContent())?.trim(),
    "UgurCelik24",
    "Sonuç forma yazılan kullanıcı adının büyük-küçük harflerini korumalı.",
  );
  assert.equal(await page.getByTestId("archive-courier").count(), 0, "Sonuçta kurye durmalı.");
  assert.equal(await page.locator(".intro").count(), 0, "Sonuçta giriş bölümü gizlenmeli.");
  assert.equal(await input.count(), 0, "Sonuçta kullanıcı adı alanı DOM'dan kalkmalı.");
  assert.equal(await submit.count(), 0, "Sonuçta tarama düğmesi DOM'dan kalkmalı.");
  assert.equal((await fakeWorkerSnapshot(page)).currentTerminated, true, "Tamamlanan Worker durmalı.");

  await page.getByRole("button", { name: "Yeniden tara" }).click();
  await page.getByTestId("progress-panel").waitFor({ state: "visible" });
  assert.equal(await input.isDisabled(), true, "Yeniden taramada kullanıcı adı alanı kilitlenmeli.");
  assert.equal(await submit.isDisabled(), true, "Yeniden taramada başlatma düğmesi kilitlenmeli.");
  await inspectCourier(page, { reducedMotion: false, expectedWidth: 56 });
  await page.getByRole("button", { name: "İptal et" }).click();
  await page.getByText(
    "Tarama iptal edildi. İstersen aynı kullanıcı adıyla yeniden başlatabilirsin.",
    { exact: true },
  ).waitFor();
  assert.equal(await page.getByTestId("archive-courier").count(), 0, "İptalde kurye durmalı.");
  assert.equal(await input.isEnabled(), true, "İptalden sonra kullanıcı adı alanı açılmalı.");
  assert.equal(await submit.isEnabled(), true, "İptalden sonra başlatma düğmesi açılmalı.");
  const cancelledSnapshot = await fakeWorkerSnapshot(page);
  assert.equal(cancelledSnapshot.instanceCount, 2, "Yeniden tarama yeni bir Worker başlatmalı.");
  assert.equal(cancelledSnapshot.currentTerminated, true, "İptal edilen Worker sonlandırılmalı.");
  await assertNoHorizontalOverflow(page, "İptal durumu");
  assertCleanPage(diagnostics, "Hareketli tarama yaşam döngüsü");
  await context.close();
  return { completed: true, cancelled: true, displayUsername: "UgurCelik24" };
}

async function inspectReducedMotionScan(origin) {
  const { context, page, diagnostics } = await createWorkerHarnessPage(origin, {
    reducedMotion: true,
    width: 320,
    height: 568,
  });
  assert.equal(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    true,
    "Reduced-motion medya sorgusu etkin olmalı.",
  );
  const input = page.locator("#username");
  const submit = page.getByRole("button", { name: "Tüm kariyeri tara" });
  await input.fill("Hiy-Z");
  await submit.click();
  await page.getByTestId("progress-panel").waitFor({ state: "visible" });
  await waitForScrollCall(page, "progress-panel", "auto");
  await inspectCourier(page, { reducedMotion: true, expectedWidth: 56 });
  await assertNoHorizontalOverflow(page, "Reduced-motion tarama ekranı");
  assert.equal(await input.isDisabled(), true, "Reduced-motion taramasında alan kilitlenmeli.");
  assert.equal(await submit.isDisabled(), true, "Reduced-motion taramasında düğme kilitlenmeli.");

  await page.getByRole("button", { name: "İptal et" }).click();
  await page.getByText(
    "Tarama iptal edildi. İstersen aynı kullanıcı adıyla yeniden başlatabilirsin.",
    { exact: true },
  ).waitFor();
  assert.equal(await page.getByTestId("archive-courier").count(), 0, "Reduced-motion iptalinde kurye kalkmalı.");
  assert.equal((await fakeWorkerSnapshot(page)).currentTerminated, true, "İptal edilen Worker durmalı.");
  assertCleanPage(diagnostics, "Reduced-motion tarama yaşam döngüsü");
  await context.close();
  return { fixedCourier: true, autoScroll: true, cancelled: true };
}

async function inspectCourierViewportBoundaries(origin) {
  const viewportChecks = [
    { width: 320, height: 568, expectedWidth: 56 },
    { width: 1_440, height: 1_000, expectedWidth: 64 },
  ];
  const checks = [];

  for (const viewport of viewportChecks) {
    const { context, page, diagnostics } = await createWorkerHarnessPage(origin, {
      reducedMotion: false,
      width: viewport.width,
      height: viewport.height,
    });
    await page.locator("#username").fill("Hiy-Z");
    await page.getByRole("button", { name: "Tüm kariyeri tara" }).click();
    await page.getByTestId("progress-panel").waitFor({ state: "visible" });
    await inspectCourier(page, {
      reducedMotion: false,
      expectedWidth: viewport.expectedWidth,
    });
    await assertNoHorizontalOverflow(
      page,
      `${viewport.width}×${viewport.height} kurye animasyonu`,
    );
    await page.getByRole("button", { name: "İptal et" }).click();
    assertCleanPage(diagnostics, `${viewport.width}×${viewport.height} kurye sınırı`);
    checks.push({ width: viewport.width, height: viewport.height, insideRoute: true });
    await context.close();
  }

  return checks;
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

  const checks = [];
  for (const viewport of viewports) {
    checks.push(await inspectViewport(origin, viewport));
  }
  const compatibility = await inspectCompatibilityStates(origin);
  const scanLifecycle = await inspectAnimatedScanLifecycle(origin);
  const reducedMotion = await inspectReducedMotionScan(origin);
  const courierViewports = await inspectCourierViewportBoundaries(origin);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        browser: { engine: "chromium", version: browser.version() },
        fixture: "Hiy-Z development-only result",
        checks,
        compatibility,
        scanLifecycle,
        reducedMotion,
        courierViewports,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer?.close().catch(() => {});
}
