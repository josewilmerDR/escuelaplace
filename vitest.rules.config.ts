import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Security-rules tests run against the Firebase EMULATORS (see `npm run test:rules`), not in
// the normal `npm test` run: they need the emulator and are slower. A separate config keeps the
// two suites independent — `npm test` stays a fast, emulator-free unit run.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/rules/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // One emulator with state cleared between tests: run files serially so two suites can't
    // clearFirestore()/clearStorage() out from under each other.
    fileParallelism: false,
  },
});
