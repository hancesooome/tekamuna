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
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached independently, almost never changes
          "vendor-react": ["react", "react-dom"],
          // Router
          "vendor-router": ["react-router-dom"],
          // Supabase client
          "vendor-supabase": ["@supabase/supabase-js"],
          // TanStack Query
          "vendor-query": ["@tanstack/react-query"],
          // Heavy canvas/image libs — only loaded on share card export
          "vendor-canvas": ["html2canvas", "html-to-image", "qrcode.react"],
        },
      },
    },
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
