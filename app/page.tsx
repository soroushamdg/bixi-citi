import { Console } from "@/components/Console";
import meta from "@/public/data/history/meta.json";

/** The shell renders statically; live data and the 3D scene load in the browser. */
export default function Home() {
  const [y, m, d] = meta.storyDay.date.split("-").map(Number);
  const dateHint = new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return <Console stationsHint={1100} tripsHint={meta.storyDay.trips} dateHint={dateHint} sourceFile={meta.source.file} />;
}
