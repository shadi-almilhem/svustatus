#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildStatusPayload,
  mergeStatusHistories,
  normalizeConfig,
  runMonitorChecks,
} from "./status-core.mjs";
import { historyFromD1Export } from "./status-d1.mjs";

const args = parseArgs(process.argv.slice(2));
const configPath = resolve(args.config ?? "monitor.config.json");
const inputPath = resolve(args.input ?? "status.json");
const outputPath = resolve(args.output ?? "status.json");
const historyInputPath = args["history-input"]
  ? resolve(args["history-input"])
  : null;

const config = normalizeConfig(await readJson(configPath));
const previousPayload = await readJson(inputPath, { optional: true });
const d1Export = historyInputPath
  ? await readJson(historyInputPath, { optional: true })
  : null;
const d1Payload = d1Export
  ? { history: historyFromD1Export(d1Export, config.monitors) }
  : null;
const mergedHistory = mergeStatusHistories(
  [previousPayload, d1Payload],
  config.monitors,
);
const { results } = await runMonitorChecks(config);
const payload = buildStatusPayload(
  config,
  { history: mergedHistory },
  results,
  new Date(),
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
await rename(`${outputPath}.tmp`, outputPath);

for (const result of results) {
  const status = result.ok ? "up" : "down";
  const code = result.status ?? result.error ?? "no response";
  console.log(
    `${result.id}: ${status} (${code}, ${result.latencyMs}ms, attempt ${result.attempt})`,
  );
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

async function readJson(path, options = {}) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (options.optional && error.code === "ENOENT") return null;
    throw error;
  }
}
