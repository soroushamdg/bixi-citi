/**
 * Hand-modelled Montréal landmarks. Placement and footprint size come from
 * OpenStreetMap (outline, minimum-area oriented box); heights from OSM tags or
 * published figures. The city build drops OSM buildings whose centroid falls in
 * a landmark's exclusion box so the model replaces, not doubles, them.
 *
 * `axis` is the bearing (° from true north) of the model's local +x, which
 * points at the front of the building. L runs along x, W across.
 */
export interface Landmark {
  key: string;
  name: string;
  blurb: string;
  lat: number;
  lon: number;
  axis: number;
  L: number;
  W: number;
  H: number;
  kind: LandmarkKind;
  /** OSM buildings with a centroid inside this box (same centre and axis) are replaced; 0 = keep all */
  exclude: { L: number; W: number } | null;
  /** camera distance for the fly-to */
  view?: number;
}

export type LandmarkKind =
  | "basilica" | "oratory" | "habitat" | "stadium" | "biosphere" | "clocktower" | "sunlife" | "pvm"
  | "cross" | "chalet" | "wheel" | "greenhouses" | "atwater" | "calder" | "fiveroses" | "arena"
  | "market" | "swp" | "deli" | "bagel";

export const LANDMARKS: Landmark[] = [
  { key: "notredame", name: "Notre-Dame Basilica", blurb: "Gothic Revival, 1829; twin towers 69 m over Place d'Armes.", lat: 45.50441, lon: -73.55599, axis: 296.5, L: 110, W: 46, H: 69, kind: "basilica", exclude: { L: 118, W: 54 }, view: 900 },
  { key: "oratory", name: "Saint Joseph's Oratory", blurb: "The largest church in Canada; its copper dome crowns Mount Royal's western summit.", lat: 45.491762, lon: -73.618237, axis: 216.7, L: 131, W: 60, H: 78, kind: "oratory", exclude: { L: 138, W: 68 }, view: 1100 },
  { key: "habitat", name: "Habitat 67", blurb: "Moshe Safdie's stacked concrete boxes, built for Expo 67.", lat: 45.499897, lon: -73.543635, axis: 4.3, L: 284, W: 89, H: 38, kind: "habitat", exclude: { L: 292, W: 96 }, view: 1300 },
  { key: "stadium", name: "Olympic Stadium", blurb: "1976 Olympics; its 165 m tower is the tallest inclined tower in the world.", lat: 45.557759, lon: -73.551635, axis: 346.5, L: 297, W: 262, H: 60, kind: "stadium", exclude: { L: 470, W: 270 }, view: 2400 },
  { key: "biosphere", name: "Montréal Biosphere", blurb: "Buckminster Fuller's 76 m geodesic dome, the U.S. pavilion at Expo 67.", lat: 45.514094, lon: -73.531427, axis: 122.5, L: 76, W: 76, H: 62, kind: "biosphere", exclude: { L: 82, W: 82 }, view: 900 },
  { key: "clock", name: "Clock Tower", blurb: "The Sailors' Memorial Clock, 45 m at the end of the Old Port's Quai de l'Horloge.", lat: 45.512251, lon: -73.545827, axis: 281.6, L: 10, W: 10, H: 45, kind: "clocktower", exclude: { L: 30, W: 12 }, view: 600 },
  { key: "sunlife", name: "Sun Life Building", blurb: "Once the largest building in the British Empire; Beaux-Arts granite, 1931.", lat: 45.500199, lon: -73.570191, axis: 124.4, L: 128, W: 64, H: 122, kind: "sunlife", exclude: { L: 132, W: 68 }, view: 1100 },
  { key: "pvm", name: "Place Ville Marie", blurb: "I. M. Pei's cruciform tower, 1962; its rooftop beacon sweeps the night.", lat: 45.501585, lon: -73.568632, axis: 124.4, L: 91, W: 90, H: 188, kind: "pvm", exclude: { L: 95, W: 95 }, view: 1500 },
  { key: "cross", name: "Mount Royal Cross", blurb: "31 m steel cross on the mountain, lit every night since 1924.", lat: 45.50884, lon: -73.5879, axis: 120, L: 12, W: 3, H: 31.4, kind: "cross", exclude: null, view: 600 },
  { key: "chalet", name: "Mount Royal Chalet", blurb: "1932 chalet behind the Kondiaronk Belvedere, the city's balcony.", lat: 45.50394, lon: -73.587504, axis: 143.5, L: 32, W: 56, H: 16, kind: "chalet", exclude: { L: 36, W: 60 }, view: 700 },
  { key: "wheel", name: "La Grande Roue", blurb: "The Old Port's 60 m observation wheel, Canada's tallest.", lat: 45.508476, lon: -73.54866, axis: 268.2, L: 10, W: 56, H: 60, kind: "wheel", exclude: { L: 12, W: 60 }, view: 650 },
  { key: "greenhouses", name: "Botanical Garden greenhouses", blurb: "The exhibition greenhouses of the Jardin botanique, one of the world's great gardens.", lat: 45.557287, lon: -73.55702, axis: 151.2, L: 64.5, W: 248, H: 18, kind: "greenhouses", exclude: { L: 68, W: 252 }, view: 1000 },
  { key: "atwater", name: "Atwater Market", blurb: "Art deco market hall and clock tower on the Lachine Canal, 1933.", lat: 45.479471, lon: -73.576807, axis: 318.7, L: 130, W: 36, H: 34, kind: "atwater", exclude: { L: 134, W: 40 }, view: 800 },
  { key: "calder", name: "Calder's L'Homme", blurb: "Alexander Calder's 21 m stainless-steel stabile in Parc Jean-Drapeau, Expo 67.", lat: 45.51062, lon: -73.53677, axis: 300, L: 20, W: 14, H: 21.3, kind: "calder", exclude: null, view: 450 },
  { key: "fiveroses", name: "Farine Five Roses", blurb: "The red rooftop sign over the Ogilvie mill, glowing since 1948.", lat: 45.49197, lon: -73.55067, axis: 305, L: 6, W: 52, H: 46, kind: "fiveroses", exclude: null, view: 700 },
  { key: "bell", name: "Centre Bell", blurb: "Home of the Canadiens since 1996; 21,000 seats.", lat: 45.496062, lon: -73.569294, axis: 131.2, L: 146, W: 107, H: 40, kind: "arena", exclude: { L: 150, W: 111 }, view: 1100 },
  { key: "jeantalon", name: "Jean-Talon Market", blurb: "Open-air market in Little Italy since 1933.", lat: 45.535914, lon: -73.615063, axis: 122.7, L: 120, W: 100, H: 9, kind: "market", exclude: { L: 125, W: 105 }, view: 700 },
  { key: "pda", name: "Place des Arts", blurb: "Salle Wilfrid-Pelletier, the colonnaded heart of the Quartier des spectacles.", lat: 45.508726, lon: -73.567212, axis: 125, L: 100, W: 72, H: 32, kind: "swp", exclude: { L: 104, W: 76 }, view: 900 },
  { key: "schwartz", name: "Schwartz's Deli", blurb: "Smoked meat on boulevard Saint-Laurent since 1928.", lat: 45.516387, lon: -73.577597, axis: 32.7, L: 23.6, W: 6.4, H: 9, kind: "deli", exclude: { L: 24, W: 7 }, view: 380 },
  { key: "fairmount", name: "Fairmount Bagel", blurb: "Wood-fired bagels, open around the clock since 1919.", lat: 45.522862, lon: -73.595166, axis: 122, L: 15.8, W: 9.2, H: 7, kind: "bagel", exclude: { L: 16, W: 10 }, view: 380 },
  { key: "stviateur", name: "St-Viateur Bagel", blurb: "The other side of Montréal's great bagel rivalry, since 1957.", lat: 45.52268, lon: -73.60195, axis: 122, L: 14, W: 8, H: 7, kind: "bagel", exclude: { L: 15, W: 9 }, view: 380 },
];

/**
 * Le Plateau-Mont-Royal: low buildings inside this street-grid box take the
 * borough's brick and greystone palette (u = Montréal east, v = Montréal north,
 * metres around the box centre).
 */
export const PLATEAU = { lat: 45.5235, lon: -73.5795, east: 2900, north: 2700 };
