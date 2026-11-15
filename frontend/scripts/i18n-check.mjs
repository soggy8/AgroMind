// Lists t()/tn() texts in src/ that have no Macedonian translation in src/shared/i18n/mk/*.ts.
// Usage: npm run i18n:check   (exit code 1 when something is missing; data like farm names may be listed on purpose)
import fs from "node:fs";
import path from "node:path";

const { parseAst } = await import(path.resolve("node_modules/rolldown/dist/parse-ast-index.mjs"));
const SRC = path.resolve("src");
const MK_DIR = path.join(SRC, "shared/i18n/mk");
const ALLOWED = new Set(["Demo Farm"]); // stored data used as a fallback, never translated
const keys = new Map();
const files = [];
const visit = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) { if (p !== MK_DIR) visit(p); } else if (/\.tsx?$/.test(p) && !p.endsWith(".d.ts")) files.push(p);
} };
visit(SRC);
const walk = (n, fn) => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach((c) => walk(c, fn));
  if (typeof n.type !== "string") return; fn(n); for (const k of Object.keys(n)) if (k !== "parent") walk(n[k], fn); };
for (const f of files) {
  let ast;
  try { ast = parseAst(fs.readFileSync(f, "utf8"), { lang: f.endsWith("x") ? "tsx" : "ts" }); } catch { continue; }
  walk(ast, (n) => {
    if (n.type !== "CallExpression" || n.callee.type !== "Identifier" || !["t", "tr", "tn", "trn"].includes(n.callee.name)) return;
    const args = ["tn", "trn"].includes(n.callee.name) ? n.arguments.slice(1, 3) : n.arguments.slice(0, 1);
    for (const a of args) if (a?.type === "Literal" && typeof a.value === "string" && !keys.has(a.value)) keys.set(a.value, path.relative(SRC, f));
  });
}
const mk = fs.readdirSync(MK_DIR).map((f) => fs.readFileSync(path.join(MK_DIR, f), "utf8")).join("\n");
const missing = [...keys].filter(([k]) => !ALLOWED.has(k) && !mk.includes(JSON.stringify(k) + ":"));
for (const [k, f] of missing) console.log(`${f}: ${JSON.stringify(k)}`);
console.log(`${keys.size} texts, ${missing.length} without Macedonian.`);
process.exit(missing.length ? 1 : 0);
