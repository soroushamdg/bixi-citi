import { fetchUpstream, trimStatus, type RawStatus } from "@/lib/gbfs";

/**
 * Live station status. The CDN keeps one copy for ~30 s, so however many
 * people have the page open, BIXI sees about two requests a minute.
 */
export async function GET() {
  try {
    const raw = await fetchUpstream<RawStatus>("station_status");
    return Response.json(trimStatus(raw, Math.floor(Date.now() / 1000)), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 502, headers: { "Cache-Control": "public, max-age=0, s-maxage=5" } },
    );
  }
}
