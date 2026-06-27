import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Keep vitest scoped to unit/integration tests under test/. The Playwright E2E
// specs live in e2e/ (*.spec.ts) and are run by `npm run test:e2e` instead.
// The react plugin transforms the .tsx the component tests import.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**", "dist-xdc/**"],
  },
});
