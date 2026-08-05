import Link from "next/link";

/**
 * Solid black band with a lime wordmark, matching Signal Pittsburgh's
 * masthead so the two publications read as siblings.
 */
export function Masthead({ compact = false }: { compact?: boolean }) {
  return (
    <header className="bg-brand-black text-white">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="flex items-center justify-between border-b border-white/10 py-2.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span>US · Tourism Signal Index</span>
          <span className="tabular">2026 Edition</span>
        </div>

        {compact ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-brand-lime">The Visitor</span>{" "}
              <span className="text-white">Economy</span>
            </Link>
            <span className="text-xs text-white/50">
              Destination marketing offices, ranked on creator readiness
            </span>
          </div>
        ) : (
          <div className="py-10 sm:py-14">
            <Link href="/" className="block">
              <h1 className="text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
                <span className="text-brand-lime">The Visitor</span>
                <br />
                <span className="text-white">Economy</span>
              </h1>
            </Link>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Which destination marketing offices are actually set up to work
              with creators — and which ones leave them at the door.
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
