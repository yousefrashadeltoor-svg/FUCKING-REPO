import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // `scripts/offline-runtime.js` is a template with @@…@@ placeholders that is
  // rendered by scripts/offline-bundle.mjs at build time, so it is not valid JS
  // on its own and must not be linted as source.
  globalIgnores([".next/**", "out/**", "out-offline/**", "build/**", "next-env.d.ts", "scripts/offline-runtime.js"]),
  {
    rules: {
      // These two rules are React-Compiler experiments. The app legitimately
      // syncs state from external systems (media elements, MediaStore, native
      // bridge callbacks) inside effects and mirrors values in refs, so they
      // fire on correct code. Real bugs are caught by typecheck + tests.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // Components defined inside a component (small icon/cell helpers) are a
      // deliberate, widely used pattern in this UI and are stable per render.
      "react-hooks/static-components": "off",
      // These fire on documented, intentional mutations (motion values, DOM
      // datasets, media elements) rather than on real state bugs.
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
    },
  },
]);
