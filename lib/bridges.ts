/**
 * Bridges over the St. Lawrence and the Rivière des Prairies. Paths come from
 * OpenStreetMap (bridge=yes, named "Pont …"); the famous ones get a hand-built
 * superstructure, the rest a deck on piers.
 */
export type BridgeKind = "cantilever" | "cablestayed" | "truss" | "deck";

export interface BridgeSpec {
  /** OSM name (bridge:name or name) */
  osm: string;
  name: string;
  kind: BridgeKind;
  /** clearance of the main span over the water, metres */
  clearance: number;
  blurb?: string;
  famous?: boolean;
}

export const BRIDGES: BridgeSpec[] = [
  { osm: "Pont Jacques-Cartier", name: "Jacques Cartier Bridge", kind: "cantilever", clearance: 49, famous: true, blurb: "Steel cantilever truss from 1930, lit at night by thousands of LEDs whose colours follow the seasons." },
  { osm: "Pont Samuel-De Champlain", name: "Samuel De Champlain Bridge", kind: "cablestayed", clearance: 40, famous: true, blurb: "The cable-stayed crossing that replaced the old Champlain in 2019; its harp pylon rises 170 m over the Seaway." },
  { osm: "Pont Victoria", name: "Victoria Bridge", kind: "truss", clearance: 18, famous: true, blurb: "Opened in 1859 as the first bridge across the St. Lawrence; still carries trains and cars." },
  { osm: "Pont Honoré-Mercier", name: "Honoré Mercier Bridge", kind: "truss", clearance: 33, famous: true, blurb: "1934 steel truss linking Lachine and Kahnawake." },
  { osm: "Pont de la Concorde", name: "Concorde Bridge", kind: "deck", clearance: 10, famous: true, blurb: "Built for Expo 67, from the Cité du Havre to the islands of Parc Jean-Drapeau." },
  { osm: "Pont Île-des-Sœurs", name: "Île-des-Sœurs Bridge", kind: "deck", clearance: 12 },
  { osm: "Pont de l'Île-aux-Tourtes", name: "Île-aux-Tourtes Bridge", kind: "deck", clearance: 14 },
  { osm: "Pont Olivier-Charbonneau", name: "Olivier-Charbonneau Bridge", kind: "deck", clearance: 16 },
  { osm: "Pont Viau", name: "Viau Bridge", kind: "deck", clearance: 10 },
  { osm: "Pont Pie-IX", name: "Pie-IX Bridge", kind: "deck", clearance: 12 },
  { osm: "Pont Papineau-Leblanc", name: "Papineau-Leblanc Bridge", kind: "cablestayed", clearance: 14, famous: true, blurb: "Cable-stayed crossing to Laval, 1969, with its slender pylons." },
  { osm: "Pont Lachapelle", name: "Lachapelle Bridge", kind: "deck", clearance: 10 },
  { osm: "Pont Médéric-Martin", name: "Médéric-Martin Bridge", kind: "deck", clearance: 14 },
  { osm: "Pont Louis-Bisson", name: "Louis-Bisson Bridge", kind: "deck", clearance: 14 },
  { osm: "Pont Charles-De-Gaulle", name: "Charles-De Gaulle Bridge", kind: "deck", clearance: 14 },
  { osm: "Pont Gédéon Ouimet", name: "Gédéon-Ouimet Bridge", kind: "deck", clearance: 14 },
  { osm: "Pont Galipeau", name: "Galipeault Bridge", kind: "deck", clearance: 12 },
  { osm: "Pont Marius-Dufresne", name: "Marius-Dufresne Bridge", kind: "deck", clearance: 10 },
  { osm: "Pont Jean-Baptiste-Legardeur", name: "Le Gardeur Bridge", kind: "deck", clearance: 10 },
  { osm: "Pont Vachon", name: "Vachon Bridge", kind: "deck", clearance: 12 },
  { osm: "Pont Clément", name: "Clément Bridge", kind: "deck", clearance: 8 },
];

/** what the city build writes to public/city/bridges.json */
export interface BuiltBridge {
  name: string;
  kind: BridgeKind;
  famous: boolean;
  blurb: string;
  clearance: number;
  /** each carriageway: points [x, y (north), deck height in scene units, over water 0/1], width in metres */
  paths: Array<{ w: number; pts: number[][] }>;
  /** the main span: start and end distance along paths[0], and its centre point */
  main: { a: number; b: number; x: number; y: number; deck: number } | null;
}
