import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert(!manifest.permissions.includes("tabs"));
assert.deepEqual(manifest.host_permissions, ["https://openrouter.ai/*"]);
for (const file of [manifest.background.service_worker, manifest.side_panel.default_path, manifest.options_page, ...Object.values(manifest.icons || {})]) assert(existsSync(file), `Missing extension file: ${file}`);
for (const file of readdirSync(".").filter((name) => name.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
for (const name of ["sidepanel.html", "options.html"]) {
  const html = readFileSync(name, "utf8");
  assert(!/<script[^>]+src=["']https?:/.test(html));
  for (const [, path] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css))"/g)) assert(existsSync(path));
}
console.log("Manifest, extension files and JavaScript syntax OK.");
