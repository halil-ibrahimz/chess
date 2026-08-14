import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { auditAllHistoryLosses } from "../audit/history-auditor.js";
import { selectDeterministicChronologicalSample } from "../audit/deterministic-sampler.js";

const GAME_PGN = `[Event "Audit fixture"]
[Site "Chess.com"]
[Date "2026.08.06"]
[White "Hiy-Z"]
[Black "Opponent"]
[Result "1/2-1/2"]

1. e4 d5 2. exd5 Qxd5 1/2-1/2`;

const chess = new Chess();
chess.loadPgn(GAME_PGN);
const FINAL_FEN = chess.fen({ forceEnpassantSquare: true });

function game(id, endTime) {
  return {
    uuid: id,
    url: `https://www.chess.com/game/live/${id}`,
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

function zeroLosses(overrides = {}) {
  return {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
    ...overrides,
  };
}

test("tüm geçmiş denetimi ayları seri işler, tekrarları tek sayar ve iki yöntemi toplar", async () => {
  const first = game("first", 1_700_000_000);
  const second = game("second", 1_710_000_000);
  const monthlyCalls = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
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
        ? [first]
        : [{ ...first, uuid: undefined }, second];
    },
  };

  const report = await auditAllHistoryLosses(client, "Hiy-Z", {
    sampleSize: 2,
    dateNowImpl: () => Date.parse("2026-08-06T12:00:00.000Z"),
  });

  assert.deepEqual(monthlyCalls, ["2026/01", "2026/02"]);
  assert.equal(maximumActiveRequests, 1);
  assert.deepEqual(report.archives, {
    found: 2,
    processed: 2,
    first: "2026/01",
    last: "2026/02",
  });
  assert.equal(report.records.found, 3);
  assert.equal(report.records.unique, 2);
  assert.equal(report.records.duplicatesSkipped, 1);
  assert.equal(report.comparison.audited, 2);
  assert.equal(report.comparison.matching, 2);
  assert.equal(report.comparison.mismatching, 0);
  assert.deepEqual(report.totals.reference, zeroLosses({ total: 2, pawn: 2 }));
  assert.deepEqual(report.totals.conservation, report.totals.reference);
  assert.equal(report.totals.allEqual, true);
  assert.equal(report.verified, true);
  assert.equal(report.sample.actual, 2);
  assert.deepEqual(
    report.sample.games.map((sample) => sample.archive),
    ["2026/01", "2026/02"],
  );
});

test("yöntem uyuşmazlığını URL, renk, iki sonuç ve tür farkıyla raporlar", async () => {
  const auditGame = {
    id: "mismatch",
    rules: "chess",
    url: "https://www.chess.com/game/live/mismatch",
    end_time: 1_700_000_000,
  };
  const client = {
    async getPlayer() {
      return { username: "hiy-z" };
    },
    async getArchiveUrls() {
      return ["https://api.chess.com/pub/player/hiy-z/games/2026/01"];
    },
    async getMonthlyGames() {
      return [auditGame];
    },
  };
  const referenceLosses = zeroLosses({ total: 1, pawn: 1 });
  const conservationLosses = zeroLosses();

  const report = await auditAllHistoryLosses(client, "Hiy-Z", {
    referenceAnalyze: () => ({ playerColor: "white", losses: referenceLosses }),
    conservationAnalyze: () => ({ playerColor: "white", losses: conservationLosses }),
    getIdentities: async () => ["url:https://www.chess.com/game/live/mismatch"],
  });

  assert.equal(report.verified, false);
  assert.equal(report.comparison.audited, 1);
  assert.equal(report.comparison.matching, 0);
  assert.equal(report.comparison.mismatching, 1);
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0].url, auditGame.url);
  assert.equal(report.mismatches[0].playerColor, "white");
  assert.deepEqual(report.mismatches[0].reference, referenceLosses);
  assert.deepEqual(report.mismatches[0].conservation, conservationLosses);
  assert.deepEqual(
    report.mismatches[0].differenceReferenceMinusConservation,
    referenceLosses,
  );
});

test("örtüşen duplicate kimlik zincirini yeniden unique saymaz ve doğrulamayı geçersiz kılar", async () => {
  const games = [
    { id: "A", rules: "chess", url: "https://example/A", end_time: 1 },
    { id: "B", rules: "chess", url: "https://example/B", end_time: 2 },
    { id: "C", rules: "chess", url: "https://example/C", end_time: 3 },
  ];
  const identities = {
    A: ["uuid:a", "sha256:x"],
    B: ["sha256:x", "uuid:b"],
    C: ["uuid:b", "sha256:c"],
  };
  const client = {
    async getPlayer() {
      return { username: "hiy-z" };
    },
    async getArchiveUrls() {
      return ["https://api.chess.com/pub/player/hiy-z/games/2026/01"];
    },
    async getMonthlyGames() {
      return games;
    },
  };
  const analysis = () => ({ playerColor: "white", losses: zeroLosses() });

  const report = await auditAllHistoryLosses(client, "Hiy-Z", {
    referenceAnalyze: analysis,
    conservationAnalyze: analysis,
    getIdentities: async (record) => identities[record.id],
  });

  assert.equal(report.records.unique, 1);
  assert.equal(report.records.duplicatesSkipped, 2);
  assert.equal(report.records.identityConflicts, 2);
  assert.equal(report.verified, false);
});

test("sabit tohumlu örnek farklı giriş sıralarında aynıdır ve 20 ayrı arşive yayılır", () => {
  const candidates = [];
  for (let month = 1; month <= 25; month += 1) {
    const archive = `2024/${String(month).padStart(2, "0")}`;
    for (let gameIndex = 0; gameIndex < 3; gameIndex += 1) {
      const identity = `url:https://example/${month}/${gameIndex}`;
      candidates.push({
        identity,
        url: identity.slice(4),
        archive,
        endTime: month * 100 + gameIndex,
      });
    }
  }

  const options = { seed: "fixed-audit-seed", size: 20 };
  const first = selectDeterministicChronologicalSample(candidates, options);
  const second = selectDeterministicChronologicalSample([...candidates].reverse(), options);

  assert.deepEqual(
    first.map((entry) => entry.identity),
    second.map((entry) => entry.identity),
  );
  assert.equal(first.length, 20);
  assert.equal(new Set(first.map((entry) => entry.archive)).size, 20);
});
