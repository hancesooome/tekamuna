/**
 * CredBadge
 *
 * Pill badge showing a source's credibility level in Filipino.
 * Used in ResultPage and CheckPage timeline and source list.
 *
 * Props:
 *   score — credibility score (0–100) from getCredibility()
 *
 * Thresholds:
 *   >= 85 → Mataas na Kredibilidad  (emerald)
 *   >= 65 → Katamtaman na Kredibilidad (blue)
 *   <  65 → Mababang Kredibilidad   (red)
 */

export function CredBadge({ score }: { score: number }) {
  if (score >= 85)
    return <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Mataas na Kredibilidad</span>;
  if (score >= 65)
    return <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Katamtaman na Kredibilidad</span>;
  return <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Mababang Kredibilidad</span>;
}
