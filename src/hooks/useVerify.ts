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
import { useNavigate } from "react-router-dom";
import { verifyClaim, ApiServiceError } from "@/services/api";
import { appendToHistory } from "@/services/historyService";
import { RESULT_STORAGE_KEY } from "@/constants";
import type { VerifyRequest, VerifyResult } from "@/types";

export function useVerify() {
  const navigate = useNavigate();

  const mutation = useMutation<VerifyResult, ApiServiceError, VerifyRequest>({
    mutationFn: verifyClaim,
    onSuccess: (data) => {
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));
      appendToHistory(data); // save to history
      void navigate("/result");
    },
  });

  return mutation;
}
