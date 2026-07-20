import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // contracts/ is a separate Hardhat project with its own package.json —
    // it's CommonJS by design (require() is correct there) and shouldn't be
    // linted against the Next.js/TS app's rules at all.
    "contracts/**",
  ]),
]);

export default eslintConfig;
