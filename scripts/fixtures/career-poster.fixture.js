export const careerPosterFixture = Object.freeze({
  displayUsername: "Hiy-Z",
  scanDate: "2026-08-11T09:00:00.000Z",
  totalGames: 5_261,
  totalLosses: 39_010,
  lostPieces: Object.freeze({
    pawn: 16_577,
    knight: 8_297,
    bishop: 7_102,
    rook: 4_521,
    queen: 2_513,
  }),
  careerRecords: Object.freeze({
    bloodiestWin: Object.freeze({ lostPieces: Object.freeze({ total: 14 }) }),
    longestBattle: Object.freeze({ moveCount: 76 }),
    fastestCheckmate: Object.freeze({ moveCount: 6 }),
  }),
});

export const longUsernameCareerPosterFixture = Object.freeze({
  ...careerPosterFixture,
  displayUsername: "UgurCelik24-UzunKariyerAdi",
});

export const missingRecordsCareerPosterFixture = Object.freeze({
  ...careerPosterFixture,
  careerRecords: Object.freeze({
    bloodiestWin: null,
    longestBattle: null,
    fastestCheckmate: null,
  }),
});

export const longRecordValuesCareerPosterFixture = Object.freeze({
  ...careerPosterFixture,
  careerRecords: Object.freeze({
    bloodiestWin: Object.freeze({ lostPieces: Object.freeze({ total: 999_999_999 }) }),
    longestBattle: Object.freeze({ moveCount: 99_999_999 }),
    fastestCheckmate: Object.freeze({ moveCount: 8_888_888 }),
  }),
});
