/**
 * Visitor counts for the corner widget, kept in Redis (over TCP, or Upstash's REST API).
 *
 * - online now: visitors whose page sent a heartbeat in the last WINDOW ms (a sorted set)
 * - online today: unique visitors since midnight in Montréal (a HyperLogLog per day)
 * - total: unique visitors ever (a HyperLogLog)
 *
 * Visitors are random ids made in the browser: no cookies, nothing personal, and
 * the HyperLogLogs keep counts, not ids. Without Redis credentials the counts
 * live in memory during development and are switched off in production.
 */
import { createClient, type RedisClientType } from "redis";

export const WINDOW = 100_000;
const P = "bixi-citi:";
const ONLINE = `${P}online`, TOTAL = `${P}visitors`;
const dayKey = (ms: number) =>
  `${P}day:${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms)}`;

export interface Stats { enabled: boolean; online: number; today: number; total: number }

interface Store {
  hello(id: string, now: number): Promise<Stats>;
  beat(id: string, now: number): Promise<void>;
  bye(id: string): Promise<void>;
  stats(now: number): Promise<Stats>;
}

type Cmd = Array<string | number>;
type Runner = (cmds: Cmd[]) => Promise<number[]>;

/** the counting logic, on top of anything that can run a batch of Redis commands */
function redisStore(run: Runner): Store {
  const read = (now: number): Cmd[] => [["ZREMRANGEBYSCORE", ONLINE, 0, now - WINDOW], ["ZCARD", ONLINE], ["PFCOUNT", dayKey(now)], ["PFCOUNT", TOTAL]];
  const pack = (r: number[]): Stats => ({ enabled: true, online: r.at(-3)!, today: r.at(-2)!, total: r.at(-1)! });
  return {
    async hello(id, now) {
      const day = dayKey(now);
      return pack(await run([["ZADD", ONLINE, now, id], ["PFADD", TOTAL, id], ["PFADD", day, id], ["EXPIRE", day, 3 * 86400], ...read(now)]));
    },
    async beat(id, now) { await run([["ZADD", ONLINE, now, id]]); },
    async bye(id) { await run([["ZREM", ONLINE, id]]); },
    async stats(now) { return pack(await run(read(now))); },
  };
}

/* ---------- Upstash REST: one HTTPS round trip per batch ---------- */
function restRunner(url: string, token: string): Runner {
  return async (cmds) => {
    const r = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const out = (await r.json()) as Array<{ result?: unknown; error?: string }>;
    const err = out.find((x) => x.error);
    if (err) throw new Error(err.error);
    return out.map((x) => Number(x.result ?? 0));
  };
}

/* ---------- plain Redis over TCP (REDIS_URL, e.g. Vercel's Redis): one connection per warm instance ---------- */
let conn: Promise<RedisClientType> | null = null;
function tcpRunner(url: string): Runner {
  const client = () =>
    (conn ??= createClient({ url, socket: { connectTimeout: 4000, reconnectStrategy: (n) => (n > 3 ? false : 200 * n) } })
      // errors surface on the commands; this listener only keeps them from crashing the process
      .on("error", () => undefined)
      // closed for good (reconnects ran out): the next request opens a fresh connection
      .on("end", () => { conn = null; })
      .connect()
      .catch((e) => { conn = null; throw e; }) as Promise<RedisClientType>);
  return async (cmds) => {
    const c = await client();
    // commands issued in the same tick go out as one pipeline
    const batch = Promise.all(cmds.map((cmd) => c.sendCommand(cmd.map(String))));
    const out = await Promise.race([batch, new Promise<never>((_, no) => setTimeout(() => no(new Error("redis timeout")), 4000))]);
    return out.map((x) => Number(x ?? 0));
  };
}

/* ---------- in memory, for `next dev` without credentials ---------- */
function memory(): Store {
  const g = globalThis as unknown as { __presence?: { seen: Map<string, number>; total: Set<string>; days: Map<string, Set<string>> } };
  const m = (g.__presence ??= { seen: new Map(), total: new Set(), days: new Map() });
  const stats = (now: number): Stats => {
    for (const [id, t] of m.seen) if (now - t > WINDOW) m.seen.delete(id);
    return { enabled: true, online: m.seen.size, today: m.days.get(dayKey(now))?.size ?? 0, total: m.total.size };
  };
  return {
    async hello(id, now) {
      m.seen.set(id, now);
      m.total.add(id);
      const k = dayKey(now);
      if (!m.days.has(k)) m.days.set(k, new Set());
      m.days.get(k)!.add(id);
      return stats(now);
    },
    async beat(id, now) { m.seen.set(id, now); },
    async bye(id) { m.seen.delete(id); },
    async stats(now) { return stats(now); },
  };
}

/**
 * Which Redis: REDIS_URL (a redis:// connection string, as Vercel's Redis
 * integration sets it), or a REST endpoint (Upstash: KV_REST_API_* from the
 * Vercel integration, or UPSTASH_REDIS_REST_*).
 */
export function presenceStore(): Store | null {
  const rest = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.REDIS_URL) return redisStore(tcpRunner(process.env.REDIS_URL));
  if (rest && token) return redisStore(restRunner(rest, token));
  return process.env.NODE_ENV === "production" ? null : memory();
}

export const OFF: Stats = { enabled: false, online: 0, today: 0, total: 0 };
