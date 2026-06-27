import react from "@vitejs/plugin-react";
import { mockWebxdc } from "@webxdc/vite-plugins";
import { defineConfig } from "vite";

// Dedicated config for Playwright E2E: serves the app over plain HTTP with only
// the mockWebxdc emulator (which injects window.webxdc and serves webxdc.js).
// It deliberately omits the secureContext HTTPS plugin so Playwright's webServer
// readiness probe can hit a normal http:// URL without a TLS handshake.
export default defineConfig({
  plugins: [react(), mockWebxdc()],
  define: { "process.env.DRAGGABLE_DEBUG": "false" },
  // strictPort: fail loudly if 3000 is taken instead of silently bumping to
  // 3001 (which would leave Playwright probing the wrong/old server).
  server: { host: true, port: 3000, strictPort: true, https: false },
});
