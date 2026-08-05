import Link from "next/link";

export function Colophon() {
  return (
    <footer className="mt-20 bg-brand-black text-white/70">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link href="/" className="hover:text-brand-lime">
            The index
          </Link>
          <Link href="/how-we-rank" className="hover:text-brand-lime">
            How we rank
          </Link>
          <Link
            href="/case-study/washington-county"
            className="hover:text-brand-lime"
          >
            Washington County
          </Link>
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-white/45">
          The Visitor Economy ranks destination marketing organisations on how
          ready they are to work with local creators. It does not rank
          destinations, and it does not rate how well any office does its job.
          Every signal is drawn from information the organisation publishes
          itself. No individual staff member is named on this site.
        </p>

        <p className="mt-6 text-xs text-white/45">
          Published by{" "}
          <a
            href="https://run-relay.com"
            className="text-brand-lime hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Relay
          </a>
          . Sibling publication to Signal Pittsburgh.
        </p>
      </div>
    </footer>
  );
}
