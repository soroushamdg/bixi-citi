"use client";
import { useEffect, useRef } from "react";
import { data } from "@/lib/store";
import { loadHistory, startLive } from "@/lib/load";
import { introCaption, refreshChapters, startStory } from "@/lib/story-controller";
import { bindTip } from "@/lib/tip";
import { Header } from "./Header";
import { Kpis } from "./Kpis";
import { Basin } from "./Basin";
import { Deck } from "./Deck";
import { Rail } from "./Rail";

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
    introCaption();
    const stop = startStory();
    const unsub = data.subscribe((s, prev) => {
      if (s.meta !== prev.meta || s.hist !== prev.hist) refreshChapters();
    });
    loadHistory().catch((e) => console.error("history", e));
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
        <footer className="foot">
          <span><b>Stations</b> station_information.json</span>
          <span><b>Counts</b> station_status.json</span>
          <span><b>History</b> {props.sourceFile}</span>
          <span><b>Map</b> © OpenStreetMap contributors</span>
          <span className="sig">Unofficial · not affiliated with BIXI Montréal · Design &amp; build by Sora</span>
        </footer>
      </div>
      <div className="tip" ref={tip} role="tooltip" />
    </>
  );
}
