/**
 * Phones get a "please open on a desktop" screen instead of the console: the 3D
 * city is built for laptop and desktop GPUs and screens. A touch-only screen that
 * is narrow (portrait) or short (landscape) counts as a phone; tablets and narrow
 * desktop windows still get the app. The same query drives the CSS in globals.css.
 */
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-height: 500px)";

export const isPhone = () => typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches;
