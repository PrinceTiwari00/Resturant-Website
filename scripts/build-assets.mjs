#!/usr/bin/env node
/**
 * Image pipeline for the Kungfu Noodles site.
 *
 * Reads the full-resolution art in assets/img/raw/ (.jpg, .jpeg or .png) and writes compact,
 * responsive WebP + JPEG derivatives into assets/img/.
 *
 *   node scripts/build-assets.mjs
 *
 * Requires ImageMagick (`convert`) on the PATH. Re-run after replacing any
 * source art. Output filenames are content-addressable by width only, so the
 * HTML srcset descriptors must match the WIDTHS table below.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "assets/img/raw");
const OUT = join(root, "assets/img");
mkdirSync(OUT, { recursive: true });

// name -> { widths: [...], ratio: [w, h] | null (keep source ratio), crop: [w,h] }
const JOBS = [
  // hero + social card — the mural inside the shop (the restaurant's own photograph)
  { name: "hero", widths: [1440, 1080, 760], ratio: [16, 9], quality: 80 },
  { name: "hero-portrait", widths: [900, 640, 420], ratio: [3, 4], quality: 78 },
  { name: "og", src: "hero", widths: [1200], ratio: [1200, 630], quality: 82, format: "jpg" },
  // the shopfront on JP Marg — the doorway, the crowd and the painted bowl
  { name: "shopfront", widths: [900, 620, 420], ratio: [4, 5], quality: 78 },
  // the big white hanging sign, used in the story block
  { name: "story", widths: [900, 620, 420], ratio: [4, 3], quality: 80 },
  // real plates photographed in the shop
  { name: "dish-beijing", widths: [620, 420, 300], ratio: [16, 11], quality: 82 },
  { name: "dish-cold-sides", widths: [620, 420, 300], ratio: [3, 4], quality: 82 },
  // the handwritten-price boards that the menu data is transcribed from
  { name: "board-noodles", widths: [620, 420], ratio: [3, 4], quality: 84 },
  { name: "board-sides", widths: [620, 420], ratio: [3, 4], quality: 84 },
  // band behind the order CTA
  { name: "order-bg", widths: [1920, 1200, 800], ratio: [16, 9], quality: 74 },
];

/* Dish photos uploaded through /admin live in raw/dish-<item id>.<ext>.
   Any menu item flagged "photo": true gets its own resize job, so adding a
   photograph never means editing this file. */
const menuPath = join(root, "assets/data/menu.json");
if (existsSync(menuPath)) {
  const menu = JSON.parse(readFileSync(menuPath, "utf8"));
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      if (!item.photo) continue;
      JOBS.push({ name: `dish-${item.id}`, widths: [620, 420, 300], ratio: [4, 3], quality: 82 });
    }
  }
}

/* `--only dish-buff-noodles` rebuilds a single job — the admin panel uses it so
   saving one photograph does not repaint the whole image set. */
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex > -1 ? process.argv[onlyIndex + 1] : null;
const jobs = only ? JOBS.filter((j) => j.name === only) : JOBS;
if (only && jobs.length === 0) {
  console.error(`! no image job named "${only}"`);
  process.exit(1);
}

let total = 0;
for (const job of jobs) {
  const base = join(RAW, job.src ?? job.name);
  const srcFile = [".jpg", ".jpeg", ".png"].map((ext) => `${base}${ext}`).find((f) => existsSync(f));
  if (!srcFile) {
    console.warn(`! skipping ${job.name}: no source art for ${base}`);
    continue;
  }
  for (const width of job.widths) {
    const [rw, rh] = job.ratio ?? [1, 1];
    const height = Math.round((width * rh) / rw);
    const formats = job.format ? [job.format] : ["webp", "jpg"];
    for (const ext of formats) {
      const outFile = join(OUT, `${job.name}-${width}.${ext}`);
      const args = [
        srcFile,
        "-auto-orient",
        "-resize", `${width}x${height}^`,
        "-gravity", job.gravity ?? "center",
        "-extent", `${width}x${height}`,
        "-colorspace", "sRGB",
        "-strip",
        "-interlace", "JPEG",
      ];
      if (ext === "webp") args.push("-quality", String(job.quality), "-define", "webp:method=6");
      else args.push("-sampling-factor", "4:2:0", "-quality", String(job.quality + 4), "-interlace", "JPEG");
      args.push(outFile);
      execFileSync("convert", args);
      const kb = Math.round(statSync(outFile).size / 1024);
      total += statSync(outFile).size;
      console.log(`  ${job.name}-${width}.${ext}  ${kb} kB`);
    }
  }
}
console.log(`\nDone. ${(total / 1024 / 1024).toFixed(2)} MB written to assets/img/`);
