// Bundles the client into dist/ with content-hashed names; Workers serves dist as static assets.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist");
const dev = process.argv.includes("--dev");

// dist is updated in place and stale files are pruned last, so a running wrangler dev never
// sees it empty.
mkdirSync(path.join(dist, "assets"), { recursive: true });
cpSync(path.join(root, "static"), dist, { recursive: true });

const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);

const js = await build({
  entryPoints: [path.join(root, "src/client/main.js")],
  bundle: true, format: "esm", target: "es2020", minify: !dev, sourcemap: false, write: false,
  legalComments: "none", loader: { ".json": "json" }, define: { DEV: String(dev) },
});
const css = await build({
  entryPoints: [path.join(root, "src/client/style.css")],
  bundle: true, minify: !dev, write: false, external: ["/fonts/*"],
});

const out = {};
for (const [name, file] of [["app.js", js.outputFiles[0]], ["style.css", css.outputFiles[0]]]) {
  const [base, ext] = name.split(".");
  const hashed = `${base}-${hash(file.contents)}.${ext}`;
  writeFileSync(path.join(dist, "assets", hashed), file.contents);
  out[name] = `/assets/${hashed}`;
}

const keep = new Set(Object.values(out).map((u) => u.replace("/assets/", "")));
for (const f of readdirSync(path.join(dist, "assets"))) if (!keep.has(f)) rmSync(path.join(dist, "assets", f));

const html = readFileSync(path.join(root, "src/client/index.html"), "utf8")
  .replace("%APP%", out["app.js"])
  .replace("%CSS%", out["style.css"]);
writeFileSync(path.join(dist, "index.html"), html);

const sizes = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else sizes.push([path.relative(dist, p), statSync(p).size]);
  }
};
walk(dist);
for (const [f, s] of sizes.sort((a, b) => b[1] - a[1])) console.log(String(s).padStart(9), f);
