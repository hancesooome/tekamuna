# Teka Muna — Coding Guidelines

## General Principles

- **No magic strings.** All constants live in `src/constants/index.ts` or `worker/ai/config/models.ts`.
- **No business logic in components.** Pages render; services and hooks do work.
- **No direct API calls in components.** All fetch() calls go through `src/services/api.ts`.
- **No direct sessionStorage access in components.** Use `historyService.ts` or read via constants.
- **One responsibility per file.** If a file does two unrelated things, split it.

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `VerdictBadge.tsx` |
| Hooks | camelCase, `use` prefix | `useVerify.ts` |
| Services | camelCase, `Service` suffix | `historyService.ts` |
| Utilities | camelCase | `sources.ts`, `hostname.ts` |
| Types | camelCase | `verify.ts` |
| Constants | camelCase | `index.ts` |

---

## TypeScript

- Prefer `interface` over `type` for object shapes.
- Use `type` for unions and aliases.
- Never use `any`. Use `unknown` and narrow with type guards.
- Export types with `export type` to keep the module graph clean.
- All function parameters and return types should be explicitly typed.

---

## React Patterns

### Components

```tsx
// ✅ Good — named export, typed props
interface Props {
  verdict: Verdict;
  confidence?: number;
}

export function VerdictBadge({ verdict, confidence }: Props) {
  // ...
}
```

```tsx
// ❌ Bad — default export anonymous component
export default ({ verdict }) => { ... }
```

### Hooks

- Wrap expensive computations in `useMemo`.
- Wrap callbacks passed as props in `useCallback`.
- Only put logic in `useEffect` that genuinely has side effects.

```tsx
// ✅ Good
const filtered = useMemo(() =>
  items.filter(item => item.active),
  [items]
);

const handleClick = useCallback((id: string) => {
  doSomething(id);
}, [doSomething]);
```

### State

- Keep state as local as possible — lift only when 2+ siblings need it.
- Prefer derived values (useMemo) over redundant state.

---

## Worker Patterns

### Adding a new route

1. Create `worker/routes/<name>.ts` with a `handle<Name>(request, env)` function.
2. Register it in `worker/index.ts`.
3. Add the route to `docs/API.md`.

### Adding a new AI task

1. Add the task name to `AITask` in `worker/ai/types/index.ts`.
2. Add a model priority list to `DEFAULT_MODELS` in `worker/ai/config/models.ts`.
3. Add the env var override name to `TASK_ENV_VARS`.
4. Document it in `docs/Services.md`.

### Never call providers directly

All AI calls must go through `AIManager.complete()`. Direct calls to OpenRouter or Gemini bypass health tracking, retry logic, and fallback.

```ts
// ✅ Good
const response = await manager.complete({ task: "VERDICT", messages });

// ❌ Bad
const response = await fetch("https://openrouter.ai/...");
```

---

## Documentation

Every new file must have a JSDoc header with:
- Purpose
- Responsibilities
- Dependencies
- When to modify

Every exported function must have a JSDoc comment with `@param` and `@returns`.

---

## Commit Convention

```
feat: add source comparison carousel navigation
fix: handle empty sessionStorage on HistoryPage
refactor: move appendToHistory to historyService
docs: update API.md with analyze-image endpoint
chore: update dependencies
```
