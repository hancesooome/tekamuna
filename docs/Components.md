# Teka Muna — Component Reference

## Layout Components (`src/components/layout/`)

---

### Navbar

Sticky top navigation bar. Always visible.

- **Left:** Logo (mascot + wordmark)
- **Center:** Nav links (Home, I-Verify, Kasaysayan, Tungkol Sa Amin)
- **Right:** Settings icon + "Suriin →" CTA button
- **Mobile:** Hamburger menu with full-screen drawer

Imports `MASCOT_URL` from `@/constants`.

---

### Footer

Minimal one-line footer at the bottom of every page.

- "Built for Every Juan" — left
- "Developed by **Hance Dagondon**" — right

---

### MobileBottomNav

Fixed bottom navigation bar visible only on small screens (`< md`).

- Home, **Suriin** (primary CTA — prominent blue circle), Kasaysayan, Tungkol

---

## Shared Components (`src/components/shared/`)

---

### PageContainer

Standard padded wrapper with `max-w-7xl` constraint. Use for all pages that don't need full-bleed sections.

```tsx
<PageContainer className="pb-12">
  {/* page content */}
</PageContainer>
```

---

### VerdictBadge

Verdict pill for use in lists and cards.

```tsx
<VerdictBadge verdict="true" confidence={85} size="sm" />
```

Props:
- `verdict: Verdict` — "true" | "false" | "misleading" | "unverified"
- `confidence?: number` — shown as "85% confident" suffix
- `size?: "sm" | "md"` — default "md"

---

### PageLoader

Full-page spinner used as the Suspense fallback while lazy-loaded pages load.

---

## UI Primitives (`src/components/ui/`)

All are shadcn/ui components. Do not modify directly — customise via Tailwind classes at the call site.

| Component | Usage |
|-----------|-------|
| Button | Primary actions, CTA buttons |
| Card | Content containers |
| Badge | Small status labels |
| Input | Text inputs |
| Textarea | Multi-line text input (VerifyPage claim field) |
| Tabs | ResultPage content tabs |
| Dialog | Modal dialogs |
| Progress | Progress bars |
| Separator | Visual dividers |
| Tooltip | Hover tooltips |

---

## Page Components (`src/pages/`)

| Page | Route | Description |
|------|-------|-------------|
| HomePage | `/` | Landing page with hero, features, recent checks |
| VerifyPage | `/verify` | Claim input form with collapsible image upload |
| ResultPage | `/result` | Fact-check result with verdict, confidence, tabs |
| SourceComparisonPage | `/result/sources` | Side-by-side source comparison with carousel |
| HistoryPage | `/kasaysayan` | Verification history with search and filter |
| AboutPage | `/tungkol` | About page with mission, team, awards |

All pages are lazy-loaded via `React.lazy()` in `src/router/index.tsx`.
