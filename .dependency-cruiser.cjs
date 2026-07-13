/**
 * Encodes the engine table from ../05-engines.md. Violations fail `npm run lint`.
 *
 * Engines (src/lib/*): pure TS, plain data. Shell (app/components/stores/server)
 * may import engines; never the reverse.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "engines-are-pure",
      comment:
        "05-engines rule 3: no framework imports inside src/lib/** — engines are plain functions over plain data",
      severity: "error",
      from: { path: "^src/lib/" },
      to: {
        path: "^node_modules/(react|react-dom|next|zustand|drizzle-orm|drizzle-kit|@xyflow|postgres)(/|$)",
      },
    },
    {
      name: "engines-never-import-shell",
      comment: "05-engines: shell imports engines, never the reverse",
      severity: "error",
      from: { path: "^src/lib/" },
      to: { path: "^src/(app|components|stores|server)/" },
    },
    {
      name: "engine-sideways-validation-simulation",
      comment:
        "05-engines table: validation/simulation may import core + registry (via index.ts), nothing else",
      severity: "error",
      from: { path: "^src/lib/(validation|simulation)/" },
      to: {
        path: "^src/lib/",
        pathNot: [
          "^src/lib/$1/",
          "^src/lib/core/index\\.ts$",
          "^src/lib/registry/index\\.ts$",
        ],
      },
    },
    {
      name: "engine-sideways-rest",
      comment:
        "05-engines table: core/registry/actions/grading/scenarios may import core only (via index.ts)",
      severity: "error",
      from: { path: "^src/lib/(core|registry|actions|grading|scenarios)/" },
      to: {
        path: "^src/lib/",
        pathNot: ["^src/lib/$1/", "^src/lib/core/index\\.ts$"],
      },
    },
    {
      name: "no-deep-engine-imports",
      comment:
        "05-engines rule 1: public API via index.ts only; engine internals and tests/ are exempt",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/lib/" },
      to: { path: "^src/lib/[^/]+/(?!index\\.ts$)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
