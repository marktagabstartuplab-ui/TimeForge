/**
 * Lucide ships no ₱ (Philippine Peso) icon — every finance surface that used
 * lucide's DollarSign ended up showing a $ regardless of the app being
 * PHP-only. Drawn to match lucide's 24x24 / stroke-2 / currentColor
 * conventions so it drops in wherever DollarSign was used.
 */
export function PesoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 4v16" />
      <path d="M7 4h6a4 4 0 0 1 0 8H7" />
      <path d="M4 9h13" />
      <path d="M4 13h6" />
    </svg>
  );
}
