/**
 * RelayWhisper, small on-brand chip linking to run-relay.com.
 *
 * Per the Spring 2026 editorial-voice revision, Relay can now appear
 * earned-in-context around the Social State / Instagram cadence block
 * (where the data most naturally invites the publisher's service).
 * Elsewhere on the page Relay still stays in the Colophon + the
 * claimed-page sidebar only.
 *
 * Two variants:
 *   whisper, compact chip, renders on every business page under Momentum
 *   editorial, longer line, renders only when IG is dormant (posts_30d=0)
 */

type RelayWhisperProps = {
  variant?: "whisper" | "editorial";
};

export function RelayWhisper({ variant = "whisper" }: RelayWhisperProps) {
  if (variant === "editorial") {
    return (
      <p className="mt-3 font-body text-sm text-brand-black/75 leading-relaxed">
        A gap creators can fill.{" "}
        <a
          href="https://run-relay.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
        >
          Pittsburgh&apos;s creator network is at run-relay.com →
        </a>
      </p>
    );
  }

  return (
    <a
      href="https://run-relay.com"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 mt-3 font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-brand-purple"
      />
      Creator matching by Relay
      <span aria-hidden="true">↗</span>
    </a>
  );
}
