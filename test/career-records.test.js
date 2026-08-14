import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { buildLossReport } from "../src/lost-pieces.js";

const PLAYER = {
  requestedUsername: "Hiy-Z",
  canonicalUsername: "Hiy-Z",
  profileUrl: "https://api.chess.com/pub/player/hiy-z",
};

function buildPgn({ moves, result, white, black, initialFen }) {
  const setup = initialFen ? `[SetUp "1"]\n[FEN "${initialFen}"]\n` : "";
  const movetext = moves ? `${moves} ${result}` : result;

  return `[Event "Career record fixture"]
[Site "Chess.com"]
[Date "2026.08.10"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]
${setup}
${movetext}`;
}

function createGame({
  id,
  moves,
  result,
  playerColor = "white",
  endTime,
  initialFen,
  opponentUsername = "Opponent",
  opponentRating = 1_650,
  timeClass = "rapid",
  timeControl = "600",
  loserResult = "resigned",
}) {
  const white = playerColor === "white" ? "Hiy-Z" : opponentUsername;
  const black = playerColor === "black" ? "Hiy-Z" : opponentUsername;
  const pgn = buildPgn({ moves, result, white, black, initialFen });
  const chess = new Chess();
  chess.loadPgn(pgn);
  const whiteWon = result === "1-0";
  const blackWon = result === "0-1";
  const draw = result === "1/2-1/2";

  return {
    uuid: id,
    url: `https://www.chess.com/game/live/${id}`,
    end_time: endTime,
    rules: "chess",
    pgn,
    fen: chess.fen({ forceEnpassantSquare: true }),
    time_class: timeClass,
    time_control: timeControl,
    white: {
      username: white,
      "@id": `https://api.chess.com/pub/player/${white.toLocaleLowerCase("en-US")}`,
      rating: playerColor === "white" ? 1_700 : opponentRating,
      result: draw ? "agreed" : whiteWon ? "win" : loserResult,
    },
    black: {
      username: black,
      "@id": `https://api.chess.com/pub/player/${black.toLocaleLowerCase("en-US")}`,
      rating: playerColor === "black" ? 1_700 : opponentRating,
      result: draw ? "agreed" : blackWon ? "win" : loserResult,
    },
  };
}

function reportFor(games) {
  return buildLossReport({
    ...PLAYER,
    requestedLimit: games.length,
    games,
    archiveMonthsFetched: 1,
    archiveGameRecordsReceived: games.length,
  });
}

function fixtureGames() {
  const whiteFlawless = createGame({
    id: "white-flawless",
    moves: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#",
    result: "1-0",
    endTime: 100,
    loserResult: "checkmated",
  });
  const blackFlawless = createGame({
    id: "black-flawless",
    moves: "1. f3 e5 2. g4 Qh4#",
    result: "0-1",
    playerColor: "black",
    endTime: 200,
    opponentUsername: "WhiteOpponent",
    opponentRating: 1_720,
    timeClass: "blitz",
    timeControl: "180",
    loserResult: "checkmated",
  });
  const bloodiest = createGame({
    id: "bloodiest",
    moves: "1. e4 d5 2. exd5 Qxd5 3. d4 Qxd4",
    result: "1-0",
    endTime: 300,
    opponentUsername: "BloodyOpponent",
    opponentRating: 1_777,
    timeClass: "rapid",
    timeControl: "600+5",
  });
  const promotedQueenLoss = createGame({
    id: "promoted-queen-loss",
    moves: "1. a8=Q+ Kh7 2. Qh8+ Kxh8",
    result: "1-0",
    initialFen: "7k/P7/8/8/8/8/7K/8 w - - 0 1",
    endTime: 400,
  });
  const onePlyTimeoutWin = createGame({
    id: "one-ply-timeout-win",
    moves: "1. e4",
    result: "1-0",
    endTime: 500,
    loserResult: "timeout",
  });
  const zeroPlyWin = createGame({
    id: "zero-ply-win",
    moves: "",
    result: "1-0",
    endTime: 600,
    loserResult: "abandoned",
  });
  const longestLoss = createGame({
    id: "longest-loss",
    moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. O-O O-O 6. Nc3 d6 7. Bg5 Be6 8. Nd5",
    result: "0-1",
    endTime: 700,
  });

  return {
    whiteFlawless,
    blackFlawless,
    bloodiest,
    promotedQueenLoss,
    onePlyTimeoutWin,
    zeroPlyWin,
    longestLoss,
  };
}

test("beyaz ve siyah galibiyetlerini aynı kurallarla kaydeder", () => {
  const { whiteFlawless, blackFlawless } = fixtureGames();
  const report = reportFor([whiteFlawless, blackFlawless]);

  assert.equal(report.careerRecords.flawlessWins, 2);
  assert.equal(report.careerRecords.bloodiestWin.playerColor, "black");
  assert.equal(report.careerRecords.bloodiestWin.userResult, "win");
  assert.equal(report.careerRecords.bloodiestWin.playerRawResult, "win");
  assert.equal(report.careerRecords.bloodiestWin.opponentRawResult, "checkmated");
  assert.equal(report.careerRecords.bloodiestWin.opponent.username, "WhiteOpponent");
  assert.equal(report.careerRecords.fastestCheckmate.playerColor, "black");
  assert.equal(report.careerRecords.fastestCheckmate.plyCount, 4);
  assert.equal(report.careerRecords.fastestCheckmate.moveCount, 2);
  assert.equal(report.careerRecords.longestBattle.playerColor, "white");
});

test("yalnız şah matla biten kullanıcı galibiyetini en hızlı mat adayı kabul eder", () => {
  const accepted = createGame({
    id: "accepted-checkmate",
    moves: "1. f3 e5 2. g4 Qh4#",
    result: "0-1",
    playerColor: "black",
    endTime: 100,
    loserResult: "checkmated",
  });
  const timeout = createGame({
    id: "timeout-checkmate-pgn",
    moves: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#",
    result: "1-0",
    endTime: 200,
    loserResult: "timeout",
  });
  const resigned = createGame({
    id: "resigned-win",
    moves: "1. e4",
    result: "1-0",
    endTime: 300,
    loserResult: "resigned",
  });
  const abandoned = createGame({
    id: "abandoned-win",
    moves: "1. e4",
    result: "1-0",
    endTime: 400,
    loserResult: "abandoned",
  });
  const userWasCheckmated = createGame({
    id: "user-was-checkmated",
    moves: "1. f3 e5 2. g4 Qh4#",
    result: "0-1",
    playerColor: "white",
    endTime: 500,
    loserResult: "checkmated",
  });

  const fastest = reportFor([
    timeout,
    resigned,
    abandoned,
    userWasCheckmated,
    accepted,
  ]).careerRecords.fastestCheckmate;
  assert.equal(fastest.url, accepted.url);
  assert.equal(fastest.userResult, "win");
  assert.equal(fastest.opponentRawResult, "checkmated");
  assert.equal(fastest.playerColor, "black");
  assert.equal(fastest.plyCount, 4);
  assert.equal(fastest.moveCount, 2);

  assert.equal(
    reportFor([timeout, resigned, abandoned, userWasCheckmated]).careerRecords
      .fastestCheckmate,
    null,
  );
});

test("üç maç rekorunu ve iki zafer sayacını mevcut analiz sonucundan üretir", () => {
  const fixtures = fixtureGames();
  const validGames = Object.values(fixtures);
  const broken = {
    ...fixtures.bloodiest,
    uuid: "broken",
    url: "https://www.chess.com/game/live/broken",
    end_time: 9_000,
    fen: new Chess().fen(),
  };
  const variant = {
    ...fixtures.bloodiest,
    uuid: "variant",
    url: "https://www.chess.com/game/live/variant",
    end_time: 10_000,
    rules: "crazyhouse",
  };
  const report = reportFor([...validGames, broken, variant]);

  assert.equal(report.gamesExamined, 7);
  assert.equal(report.gamesSkipped, 2);
  assert.deepEqual(report.lostPieces, {
    total: 3,
    pawn: 2,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 1,
  });
  assert.equal(report.careerRecords.queenLossWins, 1);
  assert.equal(report.careerRecords.flawlessWins, 4);

  assert.deepEqual(report.careerRecords.bloodiestWin, {
    url: fixtures.bloodiest.url,
    opponent: { username: "BloodyOpponent", rating: 1_777 },
    playerColor: "white",
    endTime: 300,
    timeClass: "rapid",
    timeControl: "600+5",
    userResult: "win",
    playerRawResult: "win",
    opponentRawResult: "resigned",
    moveCount: 3,
    plyCount: 6,
    lostPieces: {
      total: 2,
      pawn: 2,
      knight: 0,
      bishop: 0,
      rook: 0,
      queen: 0,
    },
  });
  assert.equal(report.careerRecords.longestBattle.url, fixtures.longestLoss.url);
  assert.equal(report.careerRecords.longestBattle.userResult, "loss");
  assert.equal(report.careerRecords.longestBattle.plyCount, 15);
  assert.equal(report.careerRecords.longestBattle.moveCount, 8);
  assert.equal(report.careerRecords.fastestCheckmate.url, fixtures.blackFlawless.url);
  assert.equal(report.careerRecords.fastestCheckmate.plyCount, 4);
  assert.equal(report.careerRecords.fastestCheckmate.moveCount, 2);
  assert.equal(report.careerRecords.fastestCheckmate.opponentRawResult, "checkmated");
});

test("eşitlikte yeni bitiş zamanını, sonra kararlı URL sırasını seçer", () => {
  const tiedB = createGame({
    id: "tie-b",
    moves: "1. f3 e5 2. g4 Qh4#",
    result: "0-1",
    playerColor: "black",
    endTime: 100,
    loserResult: "checkmated",
  });
  const tiedA = {
    ...tiedB,
    uuid: "tie-a",
    url: "https://www.chess.com/game/live/tie-a",
  };

  for (const games of [[tiedB, tiedA], [tiedA, tiedB]]) {
    const records = reportFor(games).careerRecords;
    assert.equal(records.bloodiestWin.url, tiedA.url);
    assert.equal(records.longestBattle.url, tiedA.url);
    assert.equal(records.fastestCheckmate.url, tiedA.url);
  }

  const newer = {
    ...tiedB,
    uuid: "tie-z",
    url: "https://www.chess.com/game/live/tie-z",
    end_time: 101,
  };
  const records = reportFor([tiedA, newer]).careerRecords;
  assert.equal(records.bloodiestWin.url, newer.url);
  assert.equal(records.longestBattle.url, newer.url);
  assert.equal(records.fastestCheckmate.url, newer.url);
});

test("galibiyet olmayan veya boş geçmişte galibiyet kayıtlarını null bırakır", () => {
  const draw = createGame({
    id: "draw",
    moves: "1. e4 e5",
    result: "1/2-1/2",
    endTime: 100,
  });
  const loss = createGame({
    id: "loss",
    moves: "1. e4 e5 2. Nf3 Nc6",
    result: "0-1",
    endTime: 200,
  });
  const records = reportFor([draw, loss]).careerRecords;

  assert.equal(records.bloodiestWin, null);
  assert.equal(records.fastestCheckmate, null);
  assert.equal(records.queenLossWins, 0);
  assert.equal(records.flawlessWins, 0);
  assert.equal(records.longestBattle.url, loss.url);

  assert.deepEqual(reportFor([]).careerRecords, {
    bloodiestWin: null,
    longestBattle: null,
    fastestCheckmate: null,
    queenLossWins: 0,
    flawlessWins: 0,
  });
});

test("bozuk ve atlanan maçlar kariyer kayıtlarına hiç girmez", () => {
  const validDraw = createGame({
    id: "valid-draw",
    moves: "1. e4 e5",
    result: "1/2-1/2",
    endTime: 10,
  });
  const invalidWin = {
    ...createGame({
      id: "invalid-win",
      moves: "1. e4",
      result: "1-0",
      endTime: 999,
    }),
    fen: "not-a-fen",
  };
  const unsupportedWin = {
    ...createGame({
      id: "unsupported-win",
      moves: "1. e4",
      result: "1-0",
      endTime: 1_000,
    }),
    rules: "kingofthehill",
  };
  const report = reportFor([validDraw, invalidWin, unsupportedWin]);

  assert.equal(report.gamesExamined, 1);
  assert.equal(report.gamesSkipped, 2);
  assert.equal(report.careerRecords.longestBattle.url, validDraw.url);
  assert.equal(report.careerRecords.bloodiestWin, null);
  assert.equal(report.careerRecords.fastestCheckmate, null);
  assert.equal(report.careerRecords.queenLossWins, 0);
  assert.equal(report.careerRecords.flawlessWins, 0);
  assert.deepEqual(report.lostPieces, {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
  });
});
