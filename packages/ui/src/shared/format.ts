const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Whole US dollars: 18600 → "$18,600". Same output as apps/web usd(). */
export function usd(n: number): string {
  return USD.format(Math.round(n));
}

/** Axis tick labels: 0 → "$0", 500 → "$500", 20000 → "$20k", 12500 → "$12.5k". */
export function usdCompact(n: number): string {
  if (Math.abs(n) < 1000) return `$${Math.round(n)}`;
  return `$${Number((n / 1000).toFixed(1))}k`;
}

/** part / whole as a percentage rounded to one decimal; 0 when either side is not positive. */
export function pct(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.round((part * 1000) / whole) / 10;
}
