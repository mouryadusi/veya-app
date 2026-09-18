/**
 * Veya design tokens.
 *
 * Palette: warm off-white (`ink`) as the screen surface, near-black (`bone`)
 * as primary text — the names are historical (every screen treats them as a
 * contrasting background/foreground pair) but the app is a light theme:
 * `ink` is the light surface, `bone` is the dark text. `inkElevated` is true
 * white for cards sitting a level above the base surface, the way
 * Pinterest/Swiggy separate a card from the canvas with lightness rather
 * than a border alone. Plum stays the single signature accent; gold is the
 * brand/CTA accent (gradient endpoint, hero glow); `loved` is the one
 * dedicated color for the Love it / loved / history-loved signal.
 *
 * Type: Fraunces (display serif, editorial — used only for the outfit
 * reveal and headlines) + Inter (body/UI) + IBM Plex Mono (tags, wear
 * counts, timestamps — anything that reads as "data").
 */

export const color = {
  ink: "#FAF8F4",
  inkElevated: "#FFFFFF",
  bone: "#17161A",
  boneDim: "#2B2A30",
  plum: "#5B3A5E",
  plumLight: "#8C6790",
  gold: "#B08A2E",
  loved: "#B34A5C", // the one dedicated "loved" signal — used on Love it, the loved confirmation, and history's LOVED badge/filter, consistently
  stone: "#6E6A63",
  stoneLight: "#9B9690",
  danger: "#B3543F",
  success: "#3F6B4C",
  border: "rgba(23,22,26,0.08)",
  borderOnBone: "rgba(255,255,255,0.12)",
} as const;

export const font = {
  display: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_500Medium_Italic",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  mono: "IBMPlexMono_500Medium",
} as const;

export const type = {
  hero: { fontFamily: font.display, fontSize: 34, lineHeight: 40 },
  h1: { fontFamily: font.display, fontSize: 26, lineHeight: 32 },
  h2: { fontFamily: font.bodySemibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  // The signature "hanger slide" transition used on outfit reveal / try-another.
  hangerSlide: {
    duration: 380,
  },
} as const;
