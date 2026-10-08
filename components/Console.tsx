"use client";
import { useEffect, useRef } from "react";
import { data } from "@/lib/store";
import { loadHistory, startLive, tickLiveClock } from "@/lib/load";
import { loadYearsIndex } from "@/lib/years-loader";
import { introCaption, refreshChapters, startStory } from "@/lib/story-controller";
import { bindTip } from "@/lib/tip";
import { Header } from "./Header";
import { Kpis } from "./Kpis";
import { Basin } from "./Basin";
import { Deck } from "./Deck";
import { Rail } from "./Rail";
import { Footer } from "./Footer";

export interface ConsoleProps {
  stationsHint: number;
  tripsHint: number;
  dateHint: string;
  sourceFile: string;
}

export function Console(props: ConsoleProps) {
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bindTip(tip.current);
    tickLiveClock();
    introCaption();
    const stop = startStory();
    const unsub = data.subscribe((s, prev) => {
      if (s.meta !== prev.meta || s.hist !== prev.hist) refreshChapters();
    });
    loadHistory().catch((e) => console.error("history", e));
    loadYearsIndex().catch((e) => console.error("years", e));
    startLive();
    return () => { stop(); unsub(); };
  }, []);
  return (
    <>
      <div className="app">
        <Header stationsHint={props.stationsHint} tripsHint={props.tripsHint} dateHint={props.dateHint} />
        <Kpis />
        <Basin />
        <Deck />
        <Rail />
        <Footer />
      </div>
      <div className="tip" ref={tip} role="tooltip" />
    </>
  );
}
