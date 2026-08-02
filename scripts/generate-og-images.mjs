#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { renderOgSvg } from "./og-image-core.mjs";

const args = parseArgs(process.argv.slice(2));
const input = args.input ?? "public/status.json";
const outputDirectory = resolve(args.output ?? "public/og-static");
const payload = await readPayload(input);

if (!Array.isArray(payload.monitors) || payload.monitors.length === 0) {
  throw new Error("Status payload does not contain monitors.");
}

await mkdir(outputDirectory, { recursive: true });

for (const monitor of payload.monitors) {
  const svg = renderOgSvg(monitor, payload.generatedAt);
  const outputPath = resolve(outputDirectory, `${monitor.id}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outputPath);
  console.log(`Generated ${outputPath}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[arg.slice(2)] = true;
    } else {
      parsed[arg.slice(2)] = value;
      index += 1;
    }
  }
  return parsed;
}

async function readPayload(input) {
  if (/^https?:\/\//i.test(input)) {
    const url = `${input}${input.includes("?") ? "&" : "?"}ts=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Status request failed with ${response.status}.`);
    return response.json();
  }

  return JSON.parse(await readFile(resolve(input), "utf8"));
}
