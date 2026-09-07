import { useEffect, useMemo, useState } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

const CHUNK_ERROR_PATTERN = /dynamically imported module|loading chunk|importing a module script/i;

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown application error");
}

export function RouteErrorPage() {
  const error = useRouteError();
  const message = useMemo(() => errorMessage(error), [error]);
  const isStaleChunk = CHUNK_ERROR_PATTERN.test(message);
  const recoveryKey = `teka-muna:chunk-recovery:${window.location.pathname}`;
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (!isStaleChunk || sessionStorage.getItem(recoveryKey)) return;
    sessionStorage.setItem(recoveryKey, "1");
    setIsReloading(true);
    window.location.reload();
  }, [isStaleChunk, recoveryKey]);

  const retry = () => {
    sessionStorage.removeItem(recoveryKey);
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
          {isReloading ? "↻" : "!"}
        </div>
        <h1 className="text-2xl font-bold">
          {isReloading ? "Ina-update ang Teka Muna…" : "May bagong version ng app"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isStaleChunk
            ? "Luma na ang files na naka-load sa browser. I-refresh para kunin ang latest version."
            : "Hindi mabuksan ang page ngayon. Paki-refresh at subukan ulit."}
        </p>
        {!isReloading && (
          <button
            type="button"
            onClick={retry}
            className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            I-refresh ang app
          </button>
        )}
      </section>
    </main>
  );
}
