/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Mirror prod locally: the client talks to ONE origin (the Vite dev server on
  // :5173), and the realtime WebSocket + health check are proxied to the game
  // server on :1999. So multiplayer "just works" in dev same-origin — no
  // VITE_WS_HOST needed — exactly like prod, where one Node process serves the
  // SPA and /ws together. (`npm run dev` starts both processes.)
  server: {
    proxy: {
      "/ws": { target: "http://127.0.0.1:1999", ws: true },
      "/healthz": { target: "http://127.0.0.1:1999" },
      // Accounts API also same-origin in dev (cookies "just work").
      "/api": { target: "http://127.0.0.1:1999" },
    },
  },
  // three.js makes the main chunk large; that's expected for a WebGL globe.
  build: { chunkSizeWarningLimit: 3000 },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
