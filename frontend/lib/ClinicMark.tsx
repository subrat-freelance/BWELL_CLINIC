import Image from "next/image";

/**
 * The clinic's own mark, cropped from its signboard.
 *
 * Every screen used to draw a generic activity glyph on a teal square. Nine copies of
 * a placeholder is how a real clinic's app ends up looking like a template, so the
 * mark lives here once and the chrome imports it.
 *
 * Printed documents do not use this — `lib/print.tsx` draws the same file with a plain
 * <img>, because next/image can still be loading when window.print() fires.
 */
export default function ClinicMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      width={512}
      height={512}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
      priority
    />
  );
}

/**
 * The same mark, sized up and faded back, behind a working screen. Fixed so it stays
 * put while a long patient list scrolls over it, and pointer-transparent so it never
 * eats a click. Kept faint enough not to fight a dense table for attention.
 */
export function ClinicWatermark() {
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      aria-hidden
      width={512}
      height={512}
      className="pointer-events-none fixed left-1/2 top-1/2 -z-10 w-[min(70vw,620px)]
                 -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.035] print:hidden"
    />
  );
}
