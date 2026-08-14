import { ChessComClient } from "../chess-com-client.js";
import { scanAllHistory } from "../history-scanner.js";

export function serializeWorkerError(error) {
  const stringOrNull = (value) => (typeof value === "string" && value ? value : null);

  return {
    name: stringOrNull(error?.name) ?? "Error",
    code: typeof error?.code === "string" ? error.code : "SCAN_FAILED",
    message:
      typeof error?.message === "string" && error.message
        ? error.message
        : "Tarama tamamlanamadı.",
    status: Number.isInteger(error?.status) ? error.status : null,
    stage: stringOrNull(error?.stage),
    requestUrl: stringOrNull(error?.requestUrl),
    requestPath: stringOrNull(error?.requestPath),
    archive: stringOrNull(error?.archive),
    causeName: stringOrNull(error?.cause?.name),
    causeMessage: stringOrNull(error?.cause?.message),
    stack: stringOrNull(error?.stack),
  };
}

function withDisplayUsername(result) {
  const displayUsername = typeof result?.displayUsername === "string"
    && result.displayUsername.trim()
    ? result.displayUsername.trim()
    : typeof result?.username === "string" && result.username.trim()
      ? result.username.trim()
      : null;

  return displayUsername ? { ...result, displayUsername } : result;
}

export function createHistoryWorkerController({
  postMessage,
  createClient = (options) => new ChessComClient(options),
  scanHistory = scanAllHistory,
}) {
  let running = false;

  return {
    async handleMessage(message) {
      if (message?.type !== "start") {
        return;
      }

      const scanId = message.scanId ?? null;

      if (running) {
        postMessage({
          type: "error",
          scanId,
          error: {
            name: "Error",
            code: "SCAN_ALREADY_RUNNING",
            message: "Bu Worker içinde zaten bir tarama çalışıyor.",
            status: null,
            stage: null,
            requestUrl: null,
            requestPath: null,
            archive: null,
            causeName: null,
            causeMessage: null,
            stack: null,
          },
        });
        return;
      }

      running = true;

      try {
        const emitProgress = async (event) => {
          postMessage({ type: "progress", scanId, event });
        };
        const client = createClient({ onRetry: emitProgress });
        const result = await scanHistory(client, message.username, {
          onProgress: emitProgress,
        });
        postMessage({ type: "result", scanId, result: withDisplayUsername(result) });
      } catch (error) {
        postMessage({ type: "error", scanId, error: serializeWorkerError(error) });
      } finally {
        running = false;
      }
    },
  };
}
