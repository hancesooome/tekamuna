/**
 * src/hooks/useVerify.ts
 *
 * Purpose:
 *   TanStack Query mutation hook for claim verification.
 *   The single point of entry for triggering a fact-check from any component.
 *
 * Responsibilities:
 *   - Call verifyClaim() via the API service layer
 *   - On success: persist result to sessionStorage and navigate to /result
 *   - On success: append result to history via historyService
 *   - Expose isPending, error, and reset for UI feedback
 *
 * Dependencies:
 *   - src/services/api.ts          (verifyClaim)
 *   - src/services/historyService  (appendToHistory)
 *   - src/constants/index.ts       (RESULT_STORAGE_KEY)
 *
 * Usage:
 *   const { mutate, isPending, error } = useVerify();
 *   mutate({ claim: "...", category: "Pulitika" });
 */

import { useMutation } from "@tanstack/react-query";
// useMutation → TanStack Query hook for "one-shot" server actions (POST/PUT/DELETE).
// Unlike useQuery (for data fetching), useMutation is triggered manually by calling mutate().
// It provides: isPending (loading), error, data (result), and reset().

import { useNavigate } from "react-router-dom";
// useNavigate → React Router hook that gives you a function to programmatically
// change the URL (e.g. navigate("/result")) without a full page reload.

import { verifyClaim, ApiServiceError } from "@/services/api";
// verifyClaim   → async function that POSTs a claim to the Worker's /api/verify
// ApiServiceError → custom error class thrown when the API call fails

import { appendToHistory } from "@/services/historyService";
// appendToHistory → saves the result to sessionStorage so HistoryPage can list it

import { RESULT_STORAGE_KEY } from "@/constants";
// RESULT_STORAGE_KEY → the sessionStorage key where the latest result is saved
// (e.g. "tekamuna_result"). ResultPage reads from this key on mount.

import type { VerifyRequest, VerifyResult } from "@/types";
// TypeScript-only import (no runtime cost).
// VerifyRequest → { claim: string, category?: string } — what we send to the API
// VerifyResult  → the full response object from the AI pipeline

export function useVerify() {
  // useNavigate returns a function we can call to change the URL.
  const navigate = useNavigate();

  // useMutation<TData, TError, TVariables>:
  //   TData      = VerifyResult  → what the server returns on success
  //   TError     = ApiServiceError → what gets thrown on failure
  //   TVariables = VerifyRequest  → what we pass to mutate()
  const mutation = useMutation<VerifyResult, ApiServiceError, VerifyRequest>({
    // mutationFn: the async function to call when mutate() is triggered.
    // verifyClaim receives the VerifyRequest and returns a Promise<VerifyResult>.
    mutationFn: verifyClaim,

    // onSuccess runs automatically when mutationFn resolves without error.
    // `data` is the VerifyResult returned by the API.
    onSuccess: (data) => {
      // 1. Save the result to sessionStorage so ResultPage can read it
      //    even if the user navigates back and forward.
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));

      // 2. Append to history list (for HistoryPage / kasaysayan)
      appendToHistory(data);

      // 3. Navigate to /result — React Router updates the URL without page reload.
      //    `void` discards the returned Promise (navigate() returns a Promise in v7).
      void navigate("/result");
    },
  });

  // Return the full mutation object so components can use:
  //   mutation.mutate(payload)   → triggers the API call
  //   mutation.isPending         → true while waiting for response (show spinner)
  //   mutation.error             → ApiServiceError if the call failed
  //   mutation.reset()           → clears error/data state
  return mutation;
}
