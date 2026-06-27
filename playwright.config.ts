import { defineConfig, devices } from "@playwright/test";

// E2E config: drives the real app in Chromium against the Vite dev server,
// which serves over HTTPS (secureContext plugin) with a self-signed cert and
// injects the mockWebxdc emulator that provides window.webxdc.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Pixel 5"], // mobile-first: test at a phone viewport
  },
  projects: [{ name: "chromium" }],
  webServer: {
    // Use the plain-HTTP e2e config (mockWebxdc only, no secureContext HTTPS)
    // so Playwright's readiness probe can hit a normal http:// URL.
    command: "vite --config vite.config.e2e.ts --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
