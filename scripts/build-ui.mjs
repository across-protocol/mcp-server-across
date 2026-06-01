#!/usr/bin/env node
// Bundles the swap MCP App (src/app/main.ts) into a single self-contained
// HTML file at dist/ui/swap.html, which the server registers as the
// `ui://across/swap.html` resource. The WalletConnect project id is injected
// at build time from WC_PROJECT_ID.

import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// WalletConnect project id is a public client identifier (it ships inside the
// browser bundle), so a default is fine; override with WC_PROJECT_ID if needed.
const WC_PROJECT_ID = process.env.WC_PROJECT_ID || "78c1b05a5af2e8d678a55a4a1bae5b0f";

const result = await build({
  entryPoints: [resolve(root, "src/app/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
  legalComments: "none",
  define: {
    __WC_PROJECT_ID__: JSON.stringify(WC_PROJECT_ID),
    "process.env.NODE_ENV": '"production"',
    global: "globalThis",
  },
});

const js = result.outputFiles[0].text;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Across Swap</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #1a1a1a; background: #fff;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #ececec; background: #1c1c1c; }
    .verify, .txn-body, .grid { background: #262626; }
    .calldata { background: #111; }
    .btn { background: #6d4aff; }
  }
  h1 { font-size: 16px; margin: 0 0 12px; }
  .route { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; margin-bottom: 14px; }
  .route .arrow { opacity: 0.6; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; padding: 12px; border-radius: 10px; background: #f5f5f7; margin-bottom: 12px; }
  .grid .k { opacity: 0.7; }
  .grid .v { font-variant-numeric: tabular-nums; word-break: break-all; }
  .expiry { font-size: 12px; opacity: 0.8; margin-bottom: 12px; }
  .expiry.expired { color: #c0392b; opacity: 1; font-weight: 600; }
  .warn { background: #fff3cd; color: #7a5b00; padding: 8px 10px; border-radius: 8px; margin-bottom: 12px; }
  .verify { border: 1px solid #e0a800; border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #fffaf0; }
  .verify-title { font-weight: 700; margin-bottom: 6px; }
  .verify-note { font-size: 12.5px; opacity: 0.85; margin-bottom: 10px; }
  .txn { margin: 6px 0; }
  .txn summary { cursor: pointer; }
  .txn-body { padding: 8px; margin-top: 6px; border-radius: 8px; background: #f5f5f7; font-size: 12px; word-break: break-all; }
  .calldata { background: #f0f0f0; padding: 6px; border-radius: 6px; margin-top: 4px; max-height: 120px; overflow: auto; font-family: ui-monospace, Menlo, monospace; }
  .confirm { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font-weight: 500; }
  .btn { width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #6d4aff; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .status { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: #eef; font-size: 13px; word-break: break-word; }
  .status.error { background: #fdecea; color: #b71c1c; }
  .status.success { background: #e8f5e9; color: #1b5e20; }
</style>
</head>
<body>
  <h1>Across Crosschain Swap</h1>
  <div id="content"></div>
  <div id="status" class="status info">Loading…</div>
  <script>${js}</script>
</body>
</html>
`;

const outDir = resolve(root, "dist/ui");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "swap.html"), html, "utf-8");
console.error(`[build-ui] wrote dist/ui/swap.html (${(html.length / 1024).toFixed(0)} KB)`);
