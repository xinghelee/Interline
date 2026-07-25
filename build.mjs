import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const copies = [
  ["manifest.json", "dist/manifest.json"],
  ["src/content/content.css", "dist/content.css"],
  ["src/popup/popup.html", "dist/popup.html"],
  ["src/popup/popup.css", "dist/popup.css"],
  ["src/options/options.html", "dist/options.html"],
  ["src/options/options.css", "dist/options.css"],
  ["src/adblock/rules.json", "dist/adrules.json"],
  ["src/assets/icons", "dist/icons"],
];
for (const [from, to] of copies) cpSync(from, to, { recursive: true });

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    popup: "src/popup/popup.ts",
    options: "src/options/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
