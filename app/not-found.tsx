import Link from "next/link";
import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";

export const metadata: Metadata = {
  title: "Not found, Signal Pittsburgh",
};

export default function NotFound() {
  return (
    <>
      <Masthead variant="compact" />
      <main className="flex-1 mx-auto max-w-3xl px-6 py-20 md:py-28 text-center">
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          404
        </p>
        <h1 className="mt-4 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(2rem,6vw,4rem)] leading-[0.95]">
          That page isn&apos;t in this issue.
        </h1>
        <p className="mt-6 font-body text-base md:text-lg text-brand-black/70">
          The record you&apos;re looking for may have moved, been claimed, or never made the cut.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black"
        >
          Back to the index
          <span aria-hidden="true">→</span>
        </Link>
      </main>
      <Colophon />
    </>
  );
}
