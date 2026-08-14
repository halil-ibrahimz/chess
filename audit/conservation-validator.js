import { Chess, DEFAULT_POSITION } from "chess.js";

export const LOSS_KEYS = Object.freeze([
  "total",
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
]);

const PIECE_NAMES = Object.freeze({
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
});

function emptyInventory() {
  return {
    total: 0,
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
  };
}

export class ConservationAuditError extends Error {
  constructor(reason, message, { variant, cause } = {}) {
    super(message, { cause });
    this.name = "ConservationAuditError";
    this.reason = reason;
    this.variant = variant;
  }
}

function normalizedUsername(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function normalizedProfileUrl(value) {
  return typeof value === "string"
    ? value.trim().replace(/\/$/, "").toLocaleLowerCase("en-US")
    : "";
}

function sideMatches(side, identity) {
  const username = normalizedUsername(side?.username);
  const profileUrl = normalizedProfileUrl(side?.["@id"]);
  return identity.usernames.has(username)
    || (identity.profileUrl && profileUrl === identity.profileUrl);
}

function resolvePlayerColor(game, player) {
  const identity = {
    usernames: new Set(
      [player?.requestedUsername, player?.canonicalUsername]
        .map(normalizedUsername)
        .filter(Boolean),
    ),
    profileUrl: normalizedProfileUrl(player?.profileUrl),
  };
  const isWhite = sideMatches(game?.white, identity);
  const isBlack = sideMatches(game?.black, identity);

  if (isWhite === isBlack) {
    throw new ConservationAuditError(
      "playerColorUnresolved",
      "Kullanıcının bu oyundaki rengi korunum denetimi için belirlenemedi.",
    );
  }

  return isWhite ? "w" : "b";
}

function fenCore(fen) {
  if (typeof fen !== "string") {
    return null;
  }

  try {
    return new Chess(fen).fen().split(/\s+/).slice(0, 4).join(" ");
  } catch {
    return null;
  }
}

function inventoryFromFen(fen, color) {
  const placement = typeof fen === "string" ? fen.trim().split(/\s+/)[0] : "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    throw new ConservationAuditError(
      "invalidFen",
      "Taş envanteri FEN kaydından okunamadı.",
    );
  }

  const inventory = emptyInventory();

  for (const rank of ranks) {
    let fileCount = 0;

    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) {
        fileCount += Number(symbol);
        continue;
      }

      if (!/^[pnbrqk]$/i.test(symbol)) {
        throw new ConservationAuditError(
          "invalidFen",
          "Taş envanteri FEN kaydından okunamadı.",
        );
      }

      fileCount += 1;
      const pieceColor = symbol === symbol.toUpperCase() ? "w" : "b";
      const pieceName = pieceColor === color ? PIECE_NAMES[symbol.toLowerCase()] : null;
      if (!pieceName) {
        continue;
      }

      inventory[pieceName] += 1;
      inventory.total += 1;
    }

    if (fileCount !== 8) {
      throw new ConservationAuditError(
        "invalidFen",
        "Taş envanteri FEN kaydından okunamadı.",
      );
    }
  }

  return inventory;
}

function promotionInventory(moves, color) {
  const promotions = emptyInventory();

  for (const move of moves) {
    if (move.color !== color) {
      continue;
    }

    const before = inventoryFromFen(move.before, color);
    const after = inventoryFromFen(move.after, color);
    const changedPieces = LOSS_KEYS.slice(1).filter(
      (pieceName) => before[pieceName] !== after[pieceName],
    );

    if (changedPieces.length === 0) {
      continue;
    }

    const promotedTo = ["knight", "bishop", "rook", "queen"].filter(
      (pieceName) => after[pieceName] - before[pieceName] === 1,
    );
    const isPromotion = before.pawn - after.pawn === 1
      && before.total === after.total
      && promotedTo.length === 1
      && changedPieces.length === 2;

    if (!isPromotion) {
      throw new ConservationAuditError(
        "unexpectedSelfInventoryTransition",
        "Kullanıcının kendi hamlesinde terfi dışında beklenmeyen envanter değişimi bulundu.",
      );
    }

    const [pieceName] = promotedTo;
    promotions[pieceName] += 1;
    promotions.total += 1;
  }

  return promotions;
}

function lossesFromConservation(initial, promotions, final) {
  const availableAfterPromotions = {
    pawn: initial.pawn - promotions.total,
    knight: initial.knight + promotions.knight,
    bishop: initial.bishop + promotions.bishop,
    rook: initial.rook + promotions.rook,
    queen: initial.queen + promotions.queen,
  };
  const losses = emptyInventory();

  for (const pieceName of LOSS_KEYS.slice(1)) {
    const loss = availableAfterPromotions[pieceName] - final[pieceName];
    if (!Number.isInteger(loss) || loss < 0) {
      throw new ConservationAuditError(
        "conservationInvariantMismatch",
        `Taş korunumu ${pieceName} için negatif veya geçersiz kayıp üretti.`,
      );
    }

    losses[pieceName] = loss;
    losses.total += loss;
  }

  return { availableAfterPromotions, losses };
}

export function analyzeGameByConservation(game, player) {
  const variant = typeof game?.rules === "string" ? game.rules : "unknown";
  if (variant !== "chess") {
    throw new ConservationAuditError(
      "unsupportedVariant",
      `Korunum denetimi ${variant} oyun türünü işlemiyor.`,
      { variant },
    );
  }

  if (typeof game.pgn !== "string" || game.pgn.trim() === "") {
    throw new ConservationAuditError("missingPgn", "Oyunun PGN kaydı bulunmuyor.");
  }

  const playerColor = resolvePlayerColor(game, player);
  const chess = new Chess();

  try {
    chess.loadPgn(game.pgn);
  } catch (cause) {
    throw new ConservationAuditError(
      "pgnParseError",
      "PGN korunum denetimi için ayrıştırılamadı.",
      { cause },
    );
  }

  const headers = chess.getHeaders();
  if (headers.Result === "*") {
    throw new ConservationAuditError(
      "unfinishedPgn",
      "PGN tamamlanmış bir oyun sonucu içermiyor.",
    );
  }

  const calculatedFinalFen = chess.fen({ forceEnpassantSquare: true });
  const apiFinalFen = fenCore(game.fen);
  if (!apiFinalFen || fenCore(calculatedFinalFen) !== apiFinalFen) {
    throw new ConservationAuditError(
      "finalPositionMismatch",
      "PGN son konumu Chess.com son konumuyla eşleşmiyor.",
    );
  }

  const moves = chess.history({ verbose: true });
  const fenHeader = Object.entries(headers).find(
    ([name]) => name.toLocaleLowerCase("en-US") === "fen",
  )?.[1];
  const initialFen = moves[0]?.before ?? fenHeader ?? DEFAULT_POSITION;
  const initial = inventoryFromFen(initialFen, playerColor);
  const promotions = promotionInventory(moves, playerColor);
  // Final envanter doğrudan Chess.com'un FEN kaydından okunur; PGN replay'i
  // yalnız konum eşleşmesi ve gerçekleşen terfiler için kullanılır.
  const final = inventoryFromFen(game.fen, playerColor);
  const { availableAfterPromotions, losses } = lossesFromConservation(
    initial,
    promotions,
    final,
  );

  return {
    playerColor: playerColor === "w" ? "white" : "black",
    losses,
    inventory: {
      initial,
      promotions,
      availableAfterPromotions,
      final,
    },
  };
}
