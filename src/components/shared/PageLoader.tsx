/**
 * Full-page loading skeleton shown while lazy route chunks are fetching.
 */

export function PageLoader() {
  return (
    <div
      className="mx-auto flex min-h-[60vh] w-full max-w-[850px] flex-col gap-5 px-5 py-8 sm:px-6"
      role="status"
      aria-label="Naglo-load..."
    >
      <span className="sr-only">Sandali lang...</span>
      <div className="tm-skeleton h-5 w-32 rounded-md" />
      <div className="tm-skeleton h-20 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_270px]">
        <div className="tm-skeleton h-64 rounded-lg" />
        <div className="tm-skeleton h-64 rounded-lg" />
      </div>
      <div className="tm-skeleton h-56 w-full rounded-lg" />
    </div>
  );
}
