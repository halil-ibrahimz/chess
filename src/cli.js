#!/usr/bin/env node

import { parseArgs } from "node:util";
import { ChessComApiError, ChessComClient, fetchRecentGames } from "./chess-com-client.js";
import { scanAllHistory } from "./history-scanner.js";
import { buildLossReport } from "./lost-pieces.js";

const HELP = `Kullanım:
  npm start -- <chess.com-kullanıcı-adı> [--limit <1-100> | --all]

Örnek:
  npm start -- Hiy-Z --limit 10
  npm start -- Hiy-Z --all

İsteğe bağlı ortam değişkeni:
  CHESS_COM_CONTACT=iletisim@example.com
`;

function writeProgress(event) {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      limit: { type: "string", short: "n" },
      all: { type: "boolean" },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  if (positionals.length !== 1) {
    throw new TypeError(`Tek bir Chess.com kullanıcı adı gerekli.\n\n${HELP}`);
  }

  if (values.all && values.limit !== undefined) {
    throw new TypeError("--all ve --limit aynı anda kullanılamaz.");
  }

  const client = new ChessComClient({ onRetry: writeProgress });
  const report = values.all
    ? await scanAllHistory(client, positionals[0], { onProgress: writeProgress })
    : buildLossReport(
        await fetchRecentGames(client, positionals[0], values.limit ?? "10"),
      );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const knownApiError = error instanceof ChessComApiError;
  const payload = {
    error: {
      code: knownApiError ? error.code : "INVALID_INPUT_OR_INTERNAL_ERROR",
      message: error.message,
      ...(knownApiError && error.status ? { status: error.status } : {}),
    },
  };

  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
