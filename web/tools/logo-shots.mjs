// Renders the app icons and the two logo images from the live 3D logo.
//   (wrangler dev running)  NODE_PATH=$(npm root -g) node tools/logo-shots.mjs [http://127.0.0.1:8787]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] || "http://127.0.0.1:8787";
const out = new URL("../static/", import.meta.url).pathname;
const shots = [
  ["icon-512.png", 512, "icon", false],
  ["icon-192.png", 192, "icon", false],
  ["logo-dead.png", 320, "icon&clear", true],
  ["logo-injured.png", 320, "icon=injured&clear", true],
];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [name, size, q, clear] of shots) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?nolag&${q}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__iconReady, null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + name, omitBackground: clear });
  console.log(name);
  await page.close();
}
await browser.close();
