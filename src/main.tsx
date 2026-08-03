/// <reference types="vite/client" />
// ↑ Tells TypeScript about Vite-specific types (e.g. import.meta.env).
// This is NOT a runtime import — it's just a compile-time hint.

import { StrictMode } from "react";
// StrictMode is a React wrapper that activates extra developer warnings.
// It helps catch common mistakes, like using outdated APIs or side effects in render.
// It has NO effect in production builds — it's dev-only.

import { Analytics } from "@vercel/analytics/react";
// Vercel Analytics collects page-view events for the deployed app.

import { createRoot } from "react-dom/client";
// createRoot is the modern React 18+ way to mount your app into the HTML page.
// The older ReactDOM.render() is deprecated. createRoot enables concurrent features.

import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider }  from "@/providers/AuthProvider";
import { AppRouter } from "@/router/index";

import MaintenancePage from "@/pages/MaintenancePage";
// Standalone full-screen maintenance page — shown only in production when
// VITE_MAINTENANCE_MODE is "true". Does not depend on routing or providers.

import "./index.css";
// Global CSS styles — Tailwind base layers, custom design tokens, and utility classes.

// ── Maintenance mode guard ──────────────────────────────────────────────────
// Only active in production (import.meta.env.PROD) AND when the env variable
// VITE_MAINTENANCE_MODE is explicitly set to "true".
//
// Local dev (npm run dev):
//   - import.meta.env.PROD is false, so this guard NEVER activates.
//   - You can force it locally by temporarily changing this condition,
//     but that should not be committed.
//
// Production (Vercel):
//   - Set VITE_MAINTENANCE_MODE=true in the Vercel dashboard environment
//     variables. This gets baked into the build, so it can only be changed
//     by a new deployment.
//   - To disable maintenance mode: either remove the env var or set it to
//     "false" (or any value other than "true"), then redeploy.
//
// Why here (main.tsx root) and not in the router:
//   - This is the earliest decision point in the React tree.
//   - Providers (QueryClient, StrictMode) are not needed for a static
//     maintenance page, so we skip them entirely to avoid unnecessary
//     init logic (API polling, etc.).
//   - Keeping it here makes removal trivial: delete the guard block and
//     the import, everything below stays untouched.
// ─────────────────────────────────────────────────────────────────────────────
const IS_MAINTENANCE = import.meta.env.PROD && import.meta.env.VITE_MAINTENANCE_MODE === "true";

// ── Mount point ─────────────────────────────────────────────────────────────
// document.getElementById("root") finds the <div id="root"> in index.html.
// That's the "hole" in the HTML where our entire React app gets injected.
const rootEl = document.getElementById("root");

// Guard: if the root element doesn't exist, throw an error immediately.
// This prevents a confusing "cannot read properties of null" error later.
if (!rootEl) throw new Error("Root element #root not found in index.html");

// createRoot() hands React control of the #root DOM node.
// .render() puts our component tree into the DOM.
// The order of wrappers matters:
//   StrictMode  → dev warnings
//   QueryProvider → data-fetching context
//   AppRouter   → URL routing + all page components
createRoot(rootEl).render(
  <StrictMode>
    {IS_MAINTENANCE ? (
      // Production maintenance mode: render the static page only.
      // No QueryProvider, no AppRouter — nothing that could trigger
      // API calls or route navigation.
      <MaintenancePage />
    ) : (
      // Normal app path: all providers and routing are active.
      <QueryProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </QueryProvider>
    )}
    <Analytics />
  </StrictMode>,
);
