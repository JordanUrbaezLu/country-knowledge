import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional accessible name when `label` is not plain text. */
  ariaLabel?: string;
}

/**
 * Animated segmented control with a sliding "thumb" that glides between cells.
 * The thumb is positioned by MEASURING the active button (offsetLeft/offsetWidth)
 * rather than assuming equal widths, so labels of different lengths (e.g.
 * "Explore" vs "Solo") never clip or overlap their neighbours. A ResizeObserver
 * keeps it aligned across font loads and viewport changes.
 *
 * shape="pill"  → hugs its content (mode switcher).
 * shape="segment" → fills its container in equal cells (difficulty / auth tabs).
 */
export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  shape = "segment",
  size = "md",
  className = "",
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  shape?: "pill" | "segment";
  size?: "sm" | "md";
  className?: string;
}) {
  const n = options.length;
  const active = Math.max(0, options.findIndex((o) => o.value === value));
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = btnRefs.current[active];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    btnRefs.current.forEach((b) => b && ro.observe(b));
    return () => ro.disconnect();
  }, [active, n]);

  const fill = shape === "segment";
  const trackRadius = shape === "pill" ? "rounded-full" : "rounded-xl";
  const thumbRadius = shape === "pill" ? "rounded-full" : "rounded-lg";
  const cellPad =
    size === "sm" ? "px-4 py-1.5 text-sm" : "px-4 py-2 text-sm sm:text-[0.95rem]";
  const trackBg =
    shape === "pill"
      ? "bg-slate-900/70 backdrop-blur"
      : "border border-white/10 bg-slate-950/40";

  return (
    <div
      ref={containerRef}
      role="group"
      className={`seg ${fill ? "grid w-full" : "inline-flex"} ${trackRadius} ${trackBg} ${className}`}
      style={fill ? { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } : undefined}
    >
      {/* sliding thumb — sized & positioned from the measured active button */}
      <span
        aria-hidden
        className={`seg-thumb ${thumbRadius}`}
        style={{
          width: thumb ? thumb.width : 0,
          transform: `translateX(${thumb ? thumb.left : 0}px)`,
          opacity: thumb ? 1 : 0,
        }}
      />
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            aria-label={o.ariaLabel}
            className={`seg-btn ${thumbRadius} ${cellPad} whitespace-nowrap text-center font-semibold ${
              selected ? "text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
