/**
 * Builds a run-relay.com URL tagged with UTM params so Relay can attribute
 * trials/clicks back to Signal Pittsburgh and the specific page they came from.
 */
export function relayUrl(
  path: string,
  opts: { campaign: string; content: string; params?: Record<string, string> },
): string {
  const url = new URL(path, "https://run-relay.com");
  url.searchParams.set("utm_source", "signal-pittsburgh");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", opts.campaign);
  url.searchParams.set("utm_content", opts.content);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}
