#!/usr/bin/env python3
"""
Normalize the Clay tourist-office exports into one clean org dataset.

Reads  data/raw/{state,county,muni}_{orgs,people,qualified}.csv
Writes data/orgs.json

Two things this has to get right, because the raw export gets both wrong:
  1. The org tables carry 448 rows but only ~297 real organizations. Clay's
     repeated "Update People Search" runs duplicated rows, sometimes four
     copies of the same org inside a single table. Dedupe on (name, domain).
  2. A domain is NOT a unique org. gohawaii.com covers six different island
     bureaus. Never collapse on domain alone.
"""
import csv, json, re, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "orgs.json"

TIERS = [
    ("state", "State", "state_orgs.csv", "state_people.csv", "state_qualified.csv"),
    ("county", "County / Region", "county_orgs.csv", "county_people.csv", "county_qualified.csv"),
    ("city", "City / Town", "muni_orgs.csv", "muni_people.csv", "muni_qualified.csv"),
]

# Clay writes the same concept under different column names per table.
FIELD_ALIASES = {
    "enriched_name": ["Name (2)", "Enrich Company"],
    "website": ["Website"],
    "employees": ["Employee Count"],
    "size_bucket": ["Size", "Size (2)"],
    "revenue": ["Annual Revenue"],
    "linkedin": ["LinkedIn URL", "LinkedIn Url", "Url"],
    "description": ["Description", "Description (2)"],
    "team_notes": ["Marketing Team Structure", "Marketing Team Roles", "Decision & Involvement Rank"],
    "top_contacts": ["Top Contacts", "Top 3 Contacts"],
}


def val(row, *names):
    for n in names:
        v = (row.get(n) or "").strip()
        if v:
            return v
    return ""


def pick(row, key):
    return val(row, *FIELD_ALIASES[key])


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)


def clean_domain(d):
    d = (d or "").strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^www\.", "", d)
    return d.split("/")[0]


def parse_employees(v):
    v = (v or "").strip().replace(",", "")
    return int(v) if v.isdigit() else None


# Clay emits revenue as a band string. Map to a midpoint in USD millions so it
# can be compared; the band itself is what we display.
REVENUE_BANDS = {
    "0-1m": 0.5, "1m-5m": 3, "5m-10m": 7.5, "10m-25m": 17.5,
    "25m-50m": 37.5, "50m-100m": 75, "100m-250m": 175,
    "250m-500m": 375, "500m-1b": 750, "1b-10b": 5000,
}


def parse_revenue(v):
    k = (v or "").strip().lower().replace(" ", "")
    return REVENUE_BANDS.get(k)


def load_people(fname):
    """domain -> list of {name, title, linkedin}"""
    path = RAW / fname
    out = defaultdict(list)
    if not path.exists():
        return out
    seen = set()
    for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig")):
        dom = clean_domain(val(r, "Company Domain", "Company Domain (2)"))
        name = val(r, "Full Name")
        title = val(r, "Job Title")
        if not dom or not name:
            continue
        k = (dom, name.lower(), title.lower())
        if k in seen:
            continue
        seen.add(k)
        out[dom].append({"name": name, "title": title, "linkedin": val(r, "LinkedIn Profile")})
    return out


def load_qualified(fname):
    """domain -> list of scored contacts (scores are Clay's 1-3 scale)"""
    path = RAW / fname
    out = defaultdict(list)
    if not path.exists():
        return out
    seen = set()
    for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig")):
        dom = clean_domain(val(r, "Website", "Domain"))
        name = val(r, "FullName", "Full Name", "Use AI Normalized Full Name")
        if not dom or not name:
            continue
        k = (dom, name.lower())
        if k in seen:
            continue
        seen.add(k)

        def num(*names):
            v = val(r, *names)
            try:
                return int(float(v))
            except (TypeError, ValueError):
                return None

        out[dom].append({
            "name": name,
            "title": val(r, "Job Title"),
            "fit": num("Overall Score", "Overall Fit Score"),
            "decision": num("Decision Making Score"),
            "involvement": num("Level Of Involvement Score"),
        })
    return out


def load_seed():
    """Orgs the Clay export missed, added by hand.

    The Clay list is not complete even in the states it covers best. Washington
    County PA - an active Relay account and the template every other EP
    contract is modelled on - is absent from a PA set that otherwise has 20
    sub-state entries. Anything added here is a standing correction to the
    source list, not a one-off.
    """
    path = RAW.parent / "seed-orgs.csv"
    if not path.exists():
        return []
    out = []
    for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig")):
        if not (r.get("Name") or "").strip():
            continue
        out.append(r)
    return out


def main():
    orgs = {}
    dupes = 0

    for tier_key, tier_label, orgs_f, people_f, qual_f in TIERS:
        path = RAW / orgs_f
        if not path.exists():
            print(f"  ! missing {orgs_f}", file=sys.stderr)
            continue
        people = load_people(people_f)
        qualified = load_qualified(qual_f)

        for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig")):
            name = val(r, "Name")
            domain = clean_domain(val(r, "Domain"))
            if not name or not domain:
                continue

            key = (name.strip().lower(), domain)
            if key in orgs:
                dupes += 1
                continue

            slug = slugify(f"{name}-{r.get('State','').strip()}")
            team = people.get(domain, [])
            scored = qualified.get(domain, [])

            orgs[key] = {
                "slug": slug,
                "name": name,
                "enrichedName": pick(r, "enriched_name") or name,
                "tier": tier_key,
                "tierLabel": tier_label,
                "orgType": val(r, "Type"),
                "domain": domain,
                "website": pick(r, "website") or f"https://{domain}",
                "city": val(r, "City"),
                "state": val(r, "State"),
                "zip": val(r, "Zip Code"),
                "address": val(r, "Location (Complete Address)"),
                "description": pick(r, "description"),
                "linkedin": pick(r, "linkedin"),
                "employees": parse_employees(pick(r, "employees")),
                "sizeBucket": pick(r, "size_bucket"),
                "revenueBand": pick(r, "revenue"),
                "revenueMidM": parse_revenue(pick(r, "revenue")),
                "claySourced": True,
                # Contact data stays in the dataset for internal outreach use.
                # It is never rendered on a public page - see PRIVACY in README.
                "internal": {
                    "teamCount": len(team),
                    "team": team,
                    "qualified": scored,
                },
            }

    tier_labels = {k: label for k, label, _, _, _ in TIERS}
    for r in load_seed():
        name = r["Name"].strip()
        domain = clean_domain(r.get("Domain"))
        key = (name.lower(), domain)
        if key in orgs:
            continue
        tier_key = (r.get("Tier") or "county").strip()
        orgs[key] = {
            "slug": slugify(f"{name}-{r.get('State','').strip()}"),
            "name": name,
            "enrichedName": name,
            "tier": tier_key,
            "tierLabel": tier_labels.get(tier_key, tier_key),
            "orgType": (r.get("Type") or "").strip(),
            "domain": domain,
            "website": (r.get("Website") or f"https://{domain}").strip(),
            "city": (r.get("City") or "").strip(),
            "state": (r.get("State") or "").strip(),
            "zip": (r.get("Zip Code") or "").strip(),
            "address": (r.get("Location (Complete Address)") or "").strip(),
            "description": "",
            "linkedin": "",
            "employees": None,
            "sizeBucket": (r.get("Size") or "").strip(),
            "revenueBand": "",
            "revenueMidM": None,
            "seedNote": (r.get("Note") or "").strip(),
            "claySourced": False,
            # Hand-added orgs have no Clay people search behind them, so the
            # Clay-derived signals stay unmeasured rather than scoring zero.
            "internal": {"teamCount": 0, "team": [], "qualified": []},
        }

    out = sorted(orgs.values(), key=lambda o: (o["tier"], o["state"], o["name"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))

    by_tier = defaultdict(int)
    for o in out:
        by_tier[o["tier"]] += 1
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(out)} unique orgs  ({dupes} duplicate rows dropped)")
    for k, _, _, _, _ in TIERS:
        print(f"  {k:7s} {by_tier[k]}")
    withteam = sum(1 for o in out if o["internal"]["teamCount"])
    withq = sum(1 for o in out if o["internal"]["qualified"])
    print(f"  {withteam} orgs have marketing-team people, {withq} have scored contacts")


if __name__ == "__main__":
    main()
