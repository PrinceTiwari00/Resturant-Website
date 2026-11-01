#!/usr/bin/env node
/**
 * Assembles the publishable copy of the site into `_site/`.
 *
 *   node scripts/build-site.mjs
 *
 * GitHub Pages (and any static host) should be given this directory, not the
 * repository root: the root also contains the Node server, the build scripts,
 * node_modules and — on a working machine — `data/admin.json`, none of which
 * belong on a web server.
 *
 * It is an allowlist, not a blocklist: only files a browser actually needs are
 * copied. That means adding a new secret-ish file to the repo can never leak it
 * by accident.
 */
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, cpSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");

/** Root-level files the site needs by name. */
const ROOT_FILES = ["robots.txt", "sitemap.xml", "site.webmanifest", ".nojekyll"];

/** Directories copied wholesale, except anything matching `skip`. */
const DIRS = [
  { from: "assets", skip: (relPath) => relPath.startsWith("img/raw") }, // source photography stays in the repo
];

let bytes = 0;
let files = 0;
const problems = [];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const copy = (from, to) => {
  copyFileSync(from, to);
  bytes += statSync(to).size;
  files += 1;
};

/* ------------------------------------------------------------------ pages */
const htmlPages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
if (!htmlPages.includes("index.html")) problems.push("index.html is missing — nothing to publish");
if (!htmlPages.includes("404.html")) problems.push("404.html is missing — GitHub Pages needs it for unknown URLs");
if (!existsSync(join(ROOT, ".nojekyll"))) problems.push(".nojekyll is missing — Pages would run the repo through Jekyll");

for (const file of [...htmlPages, ...ROOT_FILES]) {
  if (existsSync(join(ROOT, file))) copy(join(ROOT, file), join(OUT, file));
}

/* ----------------------------------------------------------------- assets */
for (const dir of DIRS) {
  const from = join(ROOT, dir.from);
  if (!existsSync(from)) {
    problems.push(`missing directory: ${dir.from}/`);
    continue;
  }
  cpSync(from, join(OUT, dir.from), {
    recursive: true,
    filter: (src) => {
      const rel = relative(from, src).split("\\").join("/");
      if (!rel) return true;
      if (dir.skip?.(rel)) return false;
      return true;
    },
  });
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        bytes += statSync(full).size;
        files += 1;
      }
    }
  };
  walk(join(OUT, dir.from));
}

/* ------------------------------------------------------------------ checks */
// The menu must be present, or every page that reads it breaks.
if (!existsSync(join(OUT, "assets/data/menu.json"))) problems.push("assets/data/menu.json did not make it into the build");
// Never publish credentials or customer enquiries.
for (const forbidden of ["data/admin.json", "data/inquiries.jsonl", "server.mjs", "package.json", "node_modules"]) {
  if (existsSync(join(OUT, forbidden))) problems.push(`refusing to publish ${forbidden}`);
}

/* ----------------------------------------------------------------- report */
if (problems.length) {
  console.error(`✖ ${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  · ${p}`));
  process.exit(1);
}

const mb = (bytes / 1024 / 1024).toFixed(2);
console.log(`✓ _site/ ready — ${files} files, ${mb} MB`);
console.log("  pages:", htmlPages.join(", "));
console.log("  no server, no node_modules, no credentials, no raw photo originals.");
