import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Cloudflare Pages serves static assets — target modern browsers
    target: "es2022",
    outDir: "dist",
    // Inline assets smaller than 4kb to reduce round-trips
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    // Proxy API calls to the Cloudflare Worker during local dev
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
