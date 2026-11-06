// The workspace's strict TypeScript settings (tsconfig.base.json) must reject a deliberate type error.
// The probe uses errors that only strict mode catches, so this also fails if someone turns strictness off.
// Run: pnpm --filter @socialadz/contracts test   (node:test, no extra dependencies)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

function typecheck(source) {
  const dir = mkdtempSync(join(tmpdir(), "socialadz-typecheck-"));
  try {
    writeFileSync(join(dir, "probe.mts"), source);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: join(repoRoot, "tsconfig.base.json"),
        compilerOptions: { noEmit: true },
        files: ["probe.mts"],
      }),
    );
    return spawnSync(process.execPath, [tsc, "-p", dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the strict base config rejects a deliberate type error", () => {
  // TS7006: an implicitly-any parameter (noImplicitAny). TS2322: null into a string (strictNullChecks).
  const r = typecheck("export function shout(text) { return text.toUpperCase(); }\nexport const name: string = null;\n");
  assert.notEqual(r.status, 0, "tsc accepted code with deliberate type errors");
  assert.match(r.stdout, /TS7006/);
  assert.match(r.stdout, /TS2322/);
});

test("the same config accepts correct code", () => {
  const r = typecheck("export function shout(text: string): string { return text.toUpperCase(); }\n");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// The strict family that "strict" implies, plus every flag the base turns on (except two that are not strictness).
const STRICT_FAMILY = [
  "noImplicitAny", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization",
  "strictBuiltinIteratorReturn", "noImplicitThis", "useUnknownInCatchVariables", "alwaysStrict",
];
const NOT_STRICTNESS = new Set(["skipLibCheck", "declaration"]);

function resolvedOptions(tsconfigPath) {
  const r = spawnSync(process.execPath, [tsc, "-p", tsconfigPath, "--showConfig"], { encoding: "utf8" });
  assert.equal(r.status, 0, `${tsconfigPath}: ${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout).compilerOptions ?? {};
}

test("no workspace package loosens the strict base config", () => {
  // Every tsconfig*.json in apps/* and packages/* is resolved by tsc itself (inheritance included); each must keep
  // every strict flag on. It fails closed: finding no tsconfig to check is a failure, never a pass.
  const base = JSON.parse(readFileSync(join(repoRoot, "tsconfig.base.json"), "utf8")).compilerOptions;
  const mustBeOn = [...new Set([...Object.keys(base).filter((k) => base[k] === true && !NOT_STRICTNESS.has(k)),
    ...STRICT_FAMILY])];
  const loosened = [];
  let checked = 0;
  for (const group of ["apps", "packages"]) {
    for (const name of readdirSync(join(repoRoot, group))) {
      const dir = join(repoRoot, group, name);
      if (!existsSync(join(dir, "package.json"))) continue;
      for (const file of readdirSync(dir).filter((f) => /^tsconfig.*\.json$/.test(f))) {
        const rel = `${group}/${name}/${file}`;
        if (file === "tsconfig.json" && JSON.parse(readFileSync(join(dir, file), "utf8")).extends !== "../../tsconfig.base.json") {
          loosened.push(`${rel}: does not extend the base`);
        }
        const opts = resolvedOptions(join(dir, file));
        for (const flag of mustBeOn) if (opts[flag] !== true) loosened.push(`${rel}: ${flag} is not on`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 2, `expected the api and contracts tsconfigs, checked ${checked}`);
  assert.deepEqual(loosened, []);
});
