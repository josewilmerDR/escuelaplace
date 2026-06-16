import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Mirrors the `@/*` -> `./*` path alias from tsconfig.json so tests can import like the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Security-rules tests need the Firebase emulator; they run via `npm run test:rules`
    // (vitest.rules.config.ts), never in this fast, emulator-free unit run.
    exclude: [...configDefaults.exclude, "test/rules/**"],
  },
});
