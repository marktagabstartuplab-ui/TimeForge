/**
 * Lucide ships no ₱ (Philippine Peso) icon — every finance surface that used
 * lucide's DollarSign ended up showing a $ regardless of the app being
 * PHP-only. Renders the actual ₱ glyph (U+20B1) rather than a hand-drawn
 * SVG approximation, sized/centered to drop into the same className-driven
 * boxes (h-4 w-4, h-5 w-5, etc.) that lucide icons use.
 */
export function PesoIcon({ className }: { className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        lineHeight: 1,
        fontSize: "1.15em",
      }}
    >
      ₱
    </span>
  );
}
