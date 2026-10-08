import { connection } from "next/server";
import { OFF, presenceStore } from "@/lib/presence";

/**
 * Visitor counts. GET is shared by everyone and cached at the edge for ~15 s;
 * POST registers this visitor (hello), keeps them online (beat) or lets them go (bye).
 */
const ID = /^[0-9a-f-]{36}$/i;
// crawlers and headless browsers (link previews, our own capture scripts) don't count
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit/i;

export async function GET() {
  await connection();
  const store = presenceStore();
  if (!store) return Response.json(OFF, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } });
  try {
    return Response.json(await store.stats(Date.now()), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch {
    return Response.json(OFF, { status: 503, headers: { "Cache-Control": "public, max-age=0, s-maxage=10" } });
  }
}

export async function POST(request: Request) {
  const store = presenceStore();
  if (!store) return Response.json(OFF, { headers: { "Cache-Control": "no-store" } });
  if (BOT.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  let body: { id?: unknown; kind?: unknown };
  try {
    // sendBeacon posts text/plain, so read text and parse it ourselves
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = typeof body.id === "string" && ID.test(body.id) ? body.id : null;
  if (!id) return new Response(null, { status: 400 });
  const now = Date.now();
  try {
    if (body.kind === "hello") return Response.json(await store.hello(id, now), { headers: { "Cache-Control": "no-store" } });
    if (body.kind === "beat") await store.beat(id, now);
    else if (body.kind === "bye") await store.bye(id);
    else return new Response(null, { status: 400 });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
