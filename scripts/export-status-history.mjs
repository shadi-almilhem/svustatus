#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchStatusHistory } from "./status-d1.mjs";

const args = parseArgs(process.argv.slice(2));
const url = args.url;
if (!url) throw new Error("--url is required");
const outputPath = resolve(args.output ?? "cloudflare-checks.json");
const payload = await fetchStatusHistory(url);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
await rename(`${outputPath}.tmp`, outputPath);
console.log(`Exported ${payload[0].results.length} Cloudflare status checks.`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[arg.slice(2)] = next;
      index += 1;
    }
  }
  return parsed;
}
