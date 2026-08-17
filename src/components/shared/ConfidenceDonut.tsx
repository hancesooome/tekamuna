/**
 * ConfidenceDonut
 *
 * Animated SVG donut gauge showing a percentage value.
 * Used in ResultPage and CheckPage to display AI detection confidence.
 *
 * Props:
 *   value — percentage (0–100)
 *   color — hex color string for the arc and label (e.g. "#10b981")
 */

export function ConfidenceDonut({ value, color }: { value: number; color: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg viewBox="0 0 120 120" className="w-24 h-24 sm:w-32 sm:h-32">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="12"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="60" y="56" textAnchor="middle" dominantBaseline="middle"
        className="font-black" style={{ fontSize: 22, fill: color, fontWeight: 900 }}>
        {value}%
      </text>
      <text x="60" y="75" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 10, fill: "#6b7280" }}>
        Confidence
      </text>
    </svg>
  );
}
