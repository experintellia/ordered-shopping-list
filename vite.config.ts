import react from "@vitejs/plugin-react";
import { webxdcViteConfig } from "@webxdc/vite-plugins";
import { defineConfig } from "vite";

// https://vitejs.dev/config/ — webxdcViteConfig appends buildXDC, eruda,
// mockWebxdc and secureContext to the plugins we pass in.
//
// `define` polyfills the one bare `process.env` reference react-draggable makes
// (process is undefined in the browser → would crash drag start otherwise).
export default defineConfig(
  webxdcViteConfig({
    plugins: [react()],
    define: { "process.env.DRAGGABLE_DEBUG": "false" },
  }),
);
