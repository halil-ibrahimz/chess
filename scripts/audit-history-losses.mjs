import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ChessComClient } from "../src/chess-com-client.js";
import { auditAllHistoryLosses } from "../audit/history-auditor.js";
import { DEFAULT_AUDIT_SEED } from "../audit/deterministic-sampler.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    output: { type: "string", short: "o" },
    seed: { type: "string" },
    "sample-size": { type: "string" },
  },
});

if (positionals.length !== 1) {
  throw new TypeError(
    "Kullanım: npm run audit:history -- <kullanıcı-adı> [--output <dosya>] [--seed <tohum>] [--sample-size <n>]",
  );
}

const sampleSize = Number(values["sample-size"] ?? 20);
if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 100) {
  throw new TypeError("--sample-size 1 ile 100 arasında bir tam sayı olmalı.");
}

function writeProgress(event) {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

try {
  const client = new ChessComClient({ onRetry: writeProgress });
  const report = await auditAllHistoryLosses(client, positionals[0], {
    seed: values.seed ?? DEFAULT_AUDIT_SEED,
    sampleSize,
    onProgress: writeProgress,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (values.output) {
    const outputPath = path.resolve(values.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }

  process.stdout.write(serialized);
  if (!report.verified) {
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    error: {
      name: error?.name ?? "Error",
      code: error?.code ?? "AUDIT_FAILED",
      message: error?.message ?? String(error),
      status: Number.isInteger(error?.status) ? error.status : null,
      stage: error?.stage ?? null,
      requestUrl: error?.requestUrl ?? null,
    },
  }, null, 2)}\n`);
  process.exitCode = 1;
}
