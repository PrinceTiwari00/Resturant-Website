#!/usr/bin/env node
/**
 * Set or replace the admin password.
 *
 *   npm run admin:passwd
 *   ADMIN_PASSWORD='…' npm run admin:passwd      # non-interactive / CI
 *
 * Writes `data/admin.json` (git-ignored, chmod 600) containing a scrypt hash and
 * a random signing secret. Run it again at any time to change the password —
 * every existing session token stops working the moment the hash changes,
 * because the signing secret is regenerated too.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { setPassword, hasPassword, CREDENTIALS } from "./lib/auth.mjs";

async function ask() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;

  if (!stdin.isTTY) {
    console.error("No terminal to prompt on. Pass the password in ADMIN_PASSWORD.");
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const first = await rl.question("New admin password (min 10 characters): ");
    if (first.length < 10) {
      console.error("\nToo short — use at least 10 characters.");
      process.exit(1);
    }
    const again = await rl.question("Type it again: ");
    if (first !== again) {
      console.error("\nThe two did not match. Nothing changed.");
      process.exit(1);
    }
    return first;
  } finally {
    rl.close();
  }
}

const password = await ask();

try {
  setPassword(password);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

console.log(`\n✓ Admin password set${hasPassword() ? " (replaced the previous one)" : ""}.`);
console.log(`  Credentials: ${CREDENTIALS}`);
console.log("  This file is git-ignored. Back it up if you back up the site.");
console.log("\n  Open /admin on the site and sign in.\n");
