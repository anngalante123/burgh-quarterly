import type { SignalKey } from "./tiers";
import type { Office } from "./data";

/**
 * The reporting stack a destination marketing office is graded on.
 *
 * Research is in .claude/memory/GRADED_ON.md. The finding that drives this
 * file: the metrics a marketing coordinator personally controls are the same
 * ones Destinations International now calls "indirect" and boards have
 * stopped accepting. The index is more useful to the person reading it if it
 * reads their own signals back as evidence-production capacity rather than as
 * vendor-readiness.
 */
export interface ReportingLayer {
  key: string;
  audience: string;
  question: string;
  metrics: string[];
  /** Which measured signals speak to this layer at all. */
  signals: SignalKey[];
}

export const REPORTING_STACK: ReportingLayer[] = [
  {
    key: "funders",
    audience: "County commissioners",
    question: "Does this agency deserve its budget?",
    metrics: [
      "Hotel / room tax revenue",
      "Room nights and occupancy",
      "The audited annual report",
    ],
    // Nothing a website crawl can see speaks directly to this layer, and
    // saying otherwise would be the exact overreach the index avoids.
    signals: [],
  },
  {
    key: "board",
    audience: "The board and executive director",
    question: "Is the marketing working?",
    metrics: [
      "Visitor spending and economic impact",
      "Return on ad spend",
      "Attribution",
    ],
    signals: ["partner_path"],
  },
  {
    key: "desk",
    audience: "The marketing coordinator's own scorecard",
    question: "What did you produce this quarter?",
    metrics: [
      "Earned media value",
      "Content volume and asset library",
      "Social engagement and reach",
    ],
    signals: ["canvas", "social", "team"],
  },
];

/**
 * What an office could put in front of its board, read off the signals we
 * actually measured. Deliberately conservative: only claims backed by
 * something the crawl saw, and silent where a signal was not measured.
 */
export function boardReadiness(office: Office): {
  canShow: string[];
  cannotShow: string[];
  unmeasured: boolean;
} {
  const s = office.subscores;
  const canShow: string[] = [];
  const cannotShow: string[] = [];

  const has = (k: SignalKey, floor = 40) => {
    const v = s[k];
    return v !== null && v >= floor;
  };
  const measured = (k: SignalKey) => s[k] !== null;

  // Read the notes, not the composite. A canvas score of 40 can come entirely
  // from editorial sections, which is a different claim from "has an asset
  // library" - and asserting the wrong one puts a false statement on the page.
  const note = (k: SignalKey, needle: string) =>
    (office.subscoreNotes[k] ?? []).some((n) =>
      n.toLowerCase().includes(needle),
    );

  const hasLibrary = note("canvas", "asset library");
  const hasKit = note("canvas", "media kit");
  const hasEditorial = note("canvas", "editorial section");

  if (hasLibrary || hasKit) {
    canShow.push(
      hasLibrary && hasKit
        ? "A photo library and a downloadable media kit — the raw material an annual report is built from."
        : hasLibrary
          ? "A published photo and asset library a partner can pull from."
          : "A downloadable media kit, so the office controls how it is represented.",
    );
  } else if (measured("canvas")) {
    cannotShow.push(
      "No public asset library or media kit, so a year of work leaves no owned-content record to point at.",
    );
  }

  if (hasEditorial) {
    canShow.push(
      "A working editorial back catalogue, which is evidence the office already produces content about the place.",
    );
  }

  const namesCreators = note("partner_path", "names creators");
  const hasPartnerPage = note("partner_path", "partner/media page");
  const hasPressContact = note("partner_path", "media contact");

  if (namesCreators) {
    canShow.push(
      "A page that invites creators by name, which makes earned coverage something the office asked for rather than something that happened to it.",
    );
  } else if (hasPartnerPage) {
    canShow.push(
      "A media and partners page, so there is at least a published way in.",
    );
    cannotShow.push(
      "Nothing on those pages addresses creators, so the people most likely to post about the county are not the ones being invited.",
    );
  } else if (measured("partner_path")) {
    cannotShow.push(
      "No partner or media path at all, so earned coverage arrives unattributed and cannot be claimed in a report.",
    );
  }

  if (measured("partner_path") && !hasPressContact) {
    cannotShow.push(
      "No public press or media contact, so an interested creator has to guess who to email.",
    );
  }

  if (has("social", 60)) {
    canShow.push(
      "Active channels where creator content lands and can be counted.",
    );
  } else if (measured("social")) {
    cannotShow.push("Thin social footprint, so content has nowhere to compound.");
  }

  if (has("team", 50)) {
    canShow.push("A marketing team with content and social roles already in it.");
  }

  return {
    canShow,
    cannotShow,
    unmeasured: !office.measurable,
  };
}
