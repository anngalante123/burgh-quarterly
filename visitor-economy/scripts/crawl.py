#!/usr/bin/env python3
"""
Crawl each destination marketing org's public site for creator-readiness signals.

Reads  data/orgs.json
Writes data/crawl.json   (keyed by slug)

What it looks for, and why:
  partner path   - can a creator actually reach this org? a /media, /press,
                   /influencer or /partners page, a media-contact email, a
                   pitch or partnership form
  canvas         - does the org publish assets a creator can pull from? a
                   photo/image library, a downloadable media kit, a blog or
                   news feed that is actually being updated
  social         - handles for the momentum pass (Instagram, TikTok)

Only fetches pages the site links to from its own homepage. No login, no
paywalled content, no rate hammering: one homepage fetch plus at most six
follow-ups per org, 1 req/sec per worker.
"""
import json, re, sys, time, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
ORGS = ROOT / "data" / "orgs.json"
OUT = ROOT / "data" / "crawl.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}
TIMEOUT = 20
MAX_FOLLOW = 6

# href/anchor patterns -> signal bucket
PARTNER_PAT = re.compile(
    r"(media[-_ ]?(room|kit|center|centre|relations)?|press([-_ ]?room|[-_ ]?kit)?|"
    r"influencer|creator|content[-_ ]?creator|blogger|"
    r"partner(ship)?s?|work[-_ ]with[-_ ]us|collaborat)", re.I)
CANVAS_PAT = re.compile(
    r"(photo|image|asset|gallery|b[-_ ]?roll|video[-_ ]?librar|media[-_ ]?librar|"
    r"digital[-_ ]?asset|dam\b|brand[-_ ]?resource)", re.I)
EDITORIAL_PAT = re.compile(r"(blog|news|stories|articles|itinerar|things[-_ ]to[-_ ]do|insider)", re.I)
KIT_PAT = re.compile(r"(media[-_ ]?kit|press[-_ ]?kit|brand[-_ ]?guide|toolkit)", re.I)

EMAIL_PAT = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
MEDIA_EMAIL_PAT = re.compile(r"^(media|press|pr|communications|comms|marketing|partnerships?|creator)@", re.I)

IG_PAT = re.compile(r"instagram\.com/([A-Za-z0-9_.]{2,30})", re.I)
TT_PAT = re.compile(r"tiktok\.com/@([A-Za-z0-9_.]{2,30})", re.I)
FB_PAT = re.compile(r"facebook\.com/([A-Za-z0-9_.\-]{2,60})", re.I)

SOCIAL_JUNK = {"p", "reel", "reels", "explore", "tv", "stories", "share", "accounts", "pages", "profile.php"}

_print_lock = threading.Lock()


def log(*a):
    with _print_lock:
        print(*a, file=sys.stderr, flush=True)


def get(session, url):
    """Returns (response|None, status) where status is ok / blocked / error.

    A 401/403/429 means the site's WAF turned us away. We record that as
    'blocked' and never try to work around it - a blocked site is scored as
    'not measured' on the web signals, not as a zero.
    """
    try:
        r = session.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code in (401, 403, 429):
            return None, "blocked"
        ctype = r.headers.get("content-type", "")
        if r.status_code == 200 and "html" in ctype:
            return r, "ok"
        return None, "error"
    except requests.RequestException:
        return None, "error"


def handles(html):
    out = {}
    for pat, key in ((IG_PAT, "instagram"), (TT_PAT, "tiktok"), (FB_PAT, "facebook")):
        for m in pat.finditer(html):
            h = m.group(1).strip("/.").lower()
            if h and h not in SOCIAL_JUNK:
                out[key] = h
                break
    return out


def crawl_one(org):
    slug = org["slug"]
    start = org.get("website") or f"https://{org['domain']}"
    if not start.startswith("http"):
        start = "https://" + start

    res = {
        "slug": slug,
        "domain": org["domain"],
        "reachable": False,
        "status": "error",
        "finalUrl": None,
        "partnerPages": [],
        "canvasPages": [],
        "editorialPages": [],
        "hasMediaKit": False,
        "mediaEmails": [],
        "social": {},
    }

    session = requests.Session()
    home, status = get(session, start)
    # One honest retry on the canonical https host before giving up.
    if home is None:
        alt = f"https://{org['domain']}" if not start.startswith("https://") else f"https://www.{org['domain']}"
        time.sleep(1)
        home, status2 = get(session, alt)
        if home is not None:
            status = status2
        elif status2 == "blocked":
            status = "blocked"

    res["status"] = status
    if home is None:
        return res

    res["reachable"] = True
    res["finalUrl"] = home.url
    base = home.url
    host = urlparse(base).netloc.lower().replace("www.", "")

    soup = BeautifulSoup(home.text, "html.parser")
    res["social"] = handles(home.text)

    # Bucket every same-site link by what it looks like.
    seen, follow = set(), []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "#", "javascript:")):
            continue
        url = urljoin(base, href)
        netloc = urlparse(url).netloc.lower().replace("www.", "")
        # Allow subdomains: industry.visitcalifornia.com is where the media
        # room usually lives, and it is the same organisation.
        if not (netloc == host or netloc.endswith("." + host) or host.endswith("." + netloc)):
            continue
        if url in seen:
            continue
        seen.add(url)

        text = " ".join(a.get_text(" ", strip=True).split())[:80]
        blob = f"{href} {text}"
        entry = {"url": url, "label": text or href}

        if KIT_PAT.search(blob):
            res["hasMediaKit"] = True
        if PARTNER_PAT.search(blob):
            res["partnerPages"].append(entry)
            follow.append(url)
        elif CANVAS_PAT.search(blob):
            res["canvasPages"].append(entry)
        elif EDITORIAL_PAT.search(blob):
            res["editorialPages"].append(entry)

    for k in ("partnerPages", "canvasPages", "editorialPages"):
        res[k] = res[k][:12]

    # Media contact addresses: check the homepage, then the partner pages,
    # which is where a press contact almost always lives.
    pool = home.text
    for url in follow[:MAX_FOLLOW]:
        time.sleep(1)
        sub, _ = get(session, url)
        if sub is None:
            continue
        pool += sub.text
        if KIT_PAT.search(sub.text):
            res["hasMediaKit"] = True
        if not res["social"]:
            res["social"] = handles(sub.text)

    emails = {e.lower() for e in EMAIL_PAT.findall(pool)}
    res["mediaEmails"] = sorted(e for e in emails if MEDIA_EMAIL_PAT.match(e))[:5]
    return res


def main():
    orgs = json.loads(ORGS.read_text())
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only:
        orgs = [o for o in orgs if o["tier"] == only]
    log(f"crawling {len(orgs)} orgs" + (f" (tier={only})" if only else ""))

    done = {}
    if OUT.exists():
        done = {r["slug"]: r for r in json.loads(OUT.read_text())}
        log(f"  resuming, {len(done)} already crawled")
    todo = [o for o in orgs if o["slug"] not in done]

    n = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for res in ex.map(crawl_one, todo):
            done[res["slug"]] = res
            n += 1
            if n % 20 == 0:
                log(f"  {n}/{len(todo)}")
                OUT.write_text(json.dumps(list(done.values()), indent=2))

    OUT.write_text(json.dumps(list(done.values()), indent=2))

    vals = list(done.values())
    ok = sum(1 for r in vals if r["reachable"])
    log(f"\nwrote {OUT.relative_to(ROOT)}  ({len(vals)} orgs)")
    log(f"  reachable       {ok}/{len(vals)}")
    log(f"  blocked (WAF)   {sum(1 for r in vals if r.get('status') == 'blocked')}")
    log(f"  error           {sum(1 for r in vals if r.get('status') == 'error')}")
    log(f"  partner page    {sum(1 for r in vals if r['partnerPages'])}")
    log(f"  asset library   {sum(1 for r in vals if r['canvasPages'])}")
    log(f"  media kit       {sum(1 for r in vals if r['hasMediaKit'])}")
    log(f"  media email     {sum(1 for r in vals if r['mediaEmails'])}")
    log(f"  instagram       {sum(1 for r in vals if r['social'].get('instagram'))}")


if __name__ == "__main__":
    main()
