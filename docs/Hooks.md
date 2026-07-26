# Teka Muna — Hooks Reference

## useVerify

**File:** `src/hooks/useVerify.ts`

The primary hook for submitting a fact-check request.

```ts
const { mutate, isPending, error, reset } = useVerify();

// Trigger a fact-check
mutate({ claim: "Libre ang tuition fee...", category: "Edukasyon" });
```

**Returns:** TanStack Query `UseMutationResult`

| Property | Type | Description |
|----------|------|-------------|
| mutate | `(req: VerifyRequest) => void` | Submit a claim |
| isPending | `boolean` | True while the request is in flight |
| error | `ApiServiceError \| null` | Error if the request failed |
| reset | `() => void` | Clear the error state |

**Side effects on success:**
1. Saves `VerifyResult` to `sessionStorage[RESULT_STORAGE_KEY]`
2. Appends result to history via `historyService.appendToHistory()`
3. Navigates to `/result`

**Error handling:**
- Network errors → `ApiServiceError` with no status
- Worker 422 → `ApiServiceError` with `status: 422`
- Worker 5xx → `ApiServiceError` with the HTTP status

---

## Pattern: Adding a New Hook

When to create a hook:
- Logic involves React state or effects
- Same stateful logic needed in 2+ components
- Complex async operation needing loading/error state

Where to put it: `src/hooks/use<Name>.ts`

Example skeleton:

```ts
/**
 * src/hooks/useMyFeature.ts
 *
 * Purpose: ...
 * Dependencies: ...
 */
import { useQuery } from "@tanstack/react-query";

export function useMyFeature(param: string) {
  return useQuery({
    queryKey: ["myFeature", param],
    queryFn:  () => fetchMyData(param),
    enabled:  !!param,
  });
}
```
