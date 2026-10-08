import { fetchUpstream, trimInfo, type RawInfo } from "@/lib/gbfs";

/** Station names, positions and capacities change rarely: cache for an hour. */
export async function GET() {
  try {
    const raw = await fetchUpstream<RawInfo>("station_information");
    return Response.json(trimInfo(raw), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 502, headers: { "Cache-Control": "public, max-age=0, s-maxage=5" } },
    );
  }
}
