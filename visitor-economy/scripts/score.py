#!/usr/bin/env python3
"""
Score destination marketing orgs on creator readiness.

Reads  data/orgs.json + data/crawl.json
Writes data/index.json  (what the site renders)

Mirrors Signal Pittsburgh's 5-signal composite, but inverted for the subject.
Signal Pittsburgh scores a *business* on how easy it is for a creator to
feature. A destination marketing org is not that - it is a *buyer* of creator
marketing. So the five signals ask: is this org set up to run creator work,
and can a creator actually reach them?

  1. Partner Path      30%  web   can a creator get in the door?
  2. Destination Canvas 20%  web   are there assets to pull from?
  3. Social Presence   20%  web   is there an account for content to land on?
  4. Team Capacity     20%  clay  is there a marketing team to run it?
  5. Decision Access   10%  clay  is there a reachable decision-maker?

COVERAGE RULE (the important one)
Signals 1-3 come from crawling the org's own site. Some sites block automated
requests at the WAF. A block is not evidence of a bad signal - it is evidence
of no signal. Those subscores are recorded as None and dropped from the
composite, which is then renormalised over the weight we actually measured.
An org measured on under half its weight gets NO tier at all; it is published
as "Not yet measured" rather than ranked on partial information.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "index.json"

WEIGHTS = {
    "partner_path": 0.30,
    "canvas": 0.20,
    "social": 0.20,
    "team": 0.20,
    "access": 0.10,
}
WEB_SIGNALS = {"partner_path", "canvas", "social"}
MIN_COVERAGE = 0.50

TIERS = [
    (80, "setting_the_pace", "Setting the Pace"),
    (60, "building_momentum", "Building Momentum"),
    (0, "untapped", "Untapped"),
]

# Titles that mean someone is actually doing content/social/partnership work,
# as opposed to a generic marketing title.
CONTENT_ROLE = re.compile(
    r"(content|social|digital|influencer|creator|brand|communicat|public relations|\bpr\b|media|partnership)", re.I)
SENIOR_ROLE = re.compile(r"(chief|cmo|vp|vice president|director|head of|executive)", re.I)


def clamp(x):
    return max(0.0, min(100.0, x))


# Every subscore's point budget sums to exactly 100. This matters: if one
# signal tops out at 70 and another at 100, the composite is silently biased
# toward whichever signals happen to have a reachable ceiling.
def score_partner_path(c):
    """Can a creator get in the door?"""
    if c is None or not c["reachable"]:
        return None, []
    pts, notes = 0, []
    partner = c["partnerPages"]
    if partner:
        pts += 40
        notes.append(f"{len(partner)} partner/media page{'s' if len(partner) > 1 else ''}")
        # An explicitly creator- or influencer-named page is the strongest
        # possible version of this signal.
        if any(re.search(r"(influencer|creator|blogger|collaborat)", p["label"] + p["url"], re.I) for p in partner):
            pts += 25
            notes.append("names creators explicitly")
    if c["hasMediaKit"]:
        pts += 20
        notes.append("publishes a media kit")
    if c["mediaEmails"]:
        pts += 15
        notes.append("public media contact")
    return clamp(pts), notes


def score_canvas(c):
    """Are there assets a creator can actually pull from?"""
    if c is None or not c["reachable"]:
        return None, []
    pts, notes = 0, []
    if c["canvasPages"]:
        pts += 40
        notes.append("photo / asset library")
    if c["hasMediaKit"]:
        pts += 20
        notes.append("downloadable media kit")
    ed = len(c["editorialPages"])
    if ed:
        pts += min(40, 16 + ed * 6)
        notes.append(f"{ed} editorial section{'s' if ed > 1 else ''}")
    return clamp(pts), notes


def score_social(c):
    """Is there an account for creator content to land on?

    Presence only. Cadence, follower count and engagement are a separate
    signal that needs the Instagram pass - see README "Not yet measured".
    """
    if c is None or not c["reachable"]:
        return None, []
    s = c["social"]
    pts, notes = 0, []
    if s.get("instagram"):
        pts += 55
        notes.append(f"@{s['instagram']}")
    if s.get("tiktok"):
        pts += 25
        notes.append(f"TikTok @{s['tiktok']}")
    if s.get("facebook"):
        pts += 20
    return clamp(pts), notes


def score_team(org):
    """Is there a marketing team capable of running creator work?

    Returns None for orgs that were added by hand rather than pulled from
    Clay - no people search has ever run against them, so there is nothing to
    score. Same principle as a WAF block: absent data is not a weak signal.
    """
    if not org.get("claySourced", True):
        return None, []
    team = org["internal"]["team"]
    pts, notes = 0, []

    n = len(team)
    if n:
        pts += min(40, 12 + n * 4)
        notes.append(f"{n} marketing contact{'s' if n > 1 else ''} identified")

    content_people = [p for p in team if CONTENT_ROLE.search(p["title"] or "")]
    if content_people:
        pts += min(35, 15 + len(content_people) * 5)
        notes.append(f"{len(content_people)} content / social role{'s' if len(content_people) > 1 else ''}")

    emp = org.get("employees")
    if emp:
        # Big enough to have a real marketing function, without rewarding
        # sheer headcount indefinitely.
        pts += min(25, emp * 1.2)
        notes.append(f"{emp} staff")
    return clamp(pts), notes


def score_access(org):
    """Is there a decision-maker we can actually reach?

    Returns None when Clay's people search never returned anyone for this org
    at all. That is a gap in our enrichment, not a fact about the org, and
    scoring it zero would rank an org down for our own missing data.
    """
    if not org.get("claySourced", True):
        return None, []
    internal = org["internal"]
    q = internal["qualified"]
    if not q:
        if not internal["team"]:
            return None, []
        # People were found but none were scored as decision-makers. That is
        # a real, low signal rather than a hole in the data.
        return 0.0, []

    pts, notes = 0, []
    pts += min(35, 15 + len(q) * 5)
    notes.append(f"{len(q)} scored contact{'s' if len(q) > 1 else ''}")

    # Clay scores decision-making and involvement 1-3, higher is stronger.
    dec = [c["decision"] for c in q if c.get("decision")]
    inv = [c["involvement"] for c in q if c.get("involvement")]
    if dec:
        pts += (max(dec) / 3) * 40
        if max(dec) >= 3:
            notes.append("senior decision-maker mapped")
    if inv:
        pts += (max(inv) / 3) * 25
    if any(SENIOR_ROLE.search(c["title"] or "") for c in q):
        notes.append("senior marketing title on file")
    return clamp(pts), notes


def tier_for(score):
    for cutoff, key, label in TIERS:
        if score >= cutoff:
            return key, label
    return TIERS[-1][1], TIERS[-1][2]


def main():
    orgs = json.loads((ROOT / "data" / "orgs.json").read_text())
    crawl_path = ROOT / "data" / "crawl.json"
    crawl = {}
    if crawl_path.exists():
        crawl = {r["slug"]: r for r in json.loads(crawl_path.read_text())}

    out = []
    for org in orgs:
        c = crawl.get(org["slug"])
        subs, notes = {}, {}
        for key, fn in (
            ("partner_path", lambda: score_partner_path(c)),
            ("canvas", lambda: score_canvas(c)),
            ("social", lambda: score_social(c)),
            ("team", lambda: score_team(org)),
            ("access", lambda: score_access(org)),
        ):
            s, n = fn()
            subs[key] = s
            notes[key] = n

        measured = {k: v for k, v in subs.items() if v is not None}
        coverage = sum(WEIGHTS[k] for k in measured)

        if coverage >= MIN_COVERAGE:
            composite = round(sum(subs[k] * WEIGHTS[k] for k in measured) / coverage)
            tier_key, tier_label = tier_for(composite)
            measurable = True
        else:
            composite, tier_key, tier_label, measurable = None, None, None, False

        rec = dict(org)
        rec.pop("internal", None)
        rec.update({
            "subscores": subs,
            "subscoreNotes": notes,
            "coverage": round(coverage, 2),
            "crawlStatus": (c or {}).get("status", "not_crawled"),
            "instagram": ((c or {}).get("social") or {}).get("instagram"),
            "tiktok": ((c or {}).get("social") or {}).get("tiktok"),
            # `score` is INTERNAL. It must never be rendered on a public page.
            # Public surfaces show tierLabel + gap phrasing only.
            "score": composite,
            "rankTier": tier_key,
            "rankTierLabel": tier_label,
            "measurable": measurable,
            "teamCount": org["internal"]["teamCount"],
            "qualifiedCount": len(org["internal"]["qualified"]),
        })
        out.append(rec)

    # Rank within each geography tier, measured orgs only.
    for geo in {o["tier"] for o in out}:
        ranked = sorted(
            [o for o in out if o["tier"] == geo and o["measurable"]],
            key=lambda o: (-o["score"], o["name"]),
        )
        for i, o in enumerate(ranked, 1):
            o["rank"] = i
            o["rankOf"] = len(ranked)

    OUT.write_text(json.dumps(out, indent=2))

    print(f"wrote {OUT.relative_to(ROOT)}  ({len(out)} orgs)")
    for geo in ("state", "county", "city"):
        g = [o for o in out if o["tier"] == geo]
        if not g:
            continue
        m = [o for o in g if o["measurable"]]
        print(f"\n  {geo}: {len(m)}/{len(g)} measurable")
        for _, key, label in TIERS:
            n = sum(1 for o in m if o["rankTier"] == key)
            if n:
                print(f"    {label:20s} {n}")
        if m:
            print(f"    top 5: " + ", ".join(f"{o['name'][:28]} ({o['state']})" for o in sorted(m, key=lambda x: x['rank'])[:5]))


if __name__ == "__main__":
    main()
