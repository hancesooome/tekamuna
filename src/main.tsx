/// <reference types="vite/client" />
// ↑ Tells TypeScript about Vite-specific types (e.g. import.meta.env).
// This is NOT a runtime import — it's just a compile-time hint.

import { StrictMode } from "react";
// StrictMode is a React wrapper that activates extra developer warnings.
// It helps catch common mistakes, like using outdated APIs or side effects in render.
// It has NO effect in production builds — it's dev-only.

import { createRoot } from "react-dom/client";
// createRoot is the modern React 18+ way to mount your app into the HTML page.
// The older ReactDOM.render() is deprecated. createRoot enables concurrent features.

import { QueryProvider } from "@/providers/QueryProvider";
// QueryProvider sets up TanStack Query (React Query) for the entire app.
// TanStack Query manages server state: fetching, caching, loading/error states.
// Any component inside this provider can use useQuery/useMutation hooks.

import { AppRouter } from "@/router/index";
// AppRouter is our React Router v7 configuration.
// It maps URL paths (e.g. "/verify") to page components (e.g. VerifyPage).

import "./index.css";
// Global CSS styles — Tailwind base layers, custom design tokens, and utility classes.

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
    <QueryProvider>
      <AppRouter />
    </QueryProvider>
  </StrictMode>,
);
