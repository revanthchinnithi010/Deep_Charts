/**
 * fmtVolume — compact volume display formatting utility.
 *
 * Extracted from CustomChart.tsx so CrosshairReadout and any other
 * consumer can import it without duplication.
 *
 * Examples: 1234 → "1.23K", 2_500_000 → "2.50M", 3e9 → "3.00B"
 */
export function fmtVolume(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return String(Math.round(v));
}
