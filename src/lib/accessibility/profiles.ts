/**
 * Accessibility profiles.
 *
 * Important honesty note (also shown in the UI): this app cannot diagnose
 * or clinically address any condition. What it CAN do is offer a small set
 * of real, well-supported visual/interaction adjustments — contrast, text
 * size, spacing, motion, color-safe palettes, touch target size. Each named
 * condition below maps to whichever of those actually help, based on
 * commonly cited accommodation guidance. Several requested conditions
 * (e.g. Parkinson's, essential tremor, Wilson's disease, osteoarthritis)
 * are primarily motor conditions — for those we only reasonably offer
 * larger touch targets and reduced precision requirements, not a
 * "clinical mode." We say so rather than inventing a bespoke effect.
 */

export type AdjustmentKey =
  | "highContrast"
  | "largeText"
  | "extraSpacing"
  | "reduceMotion"
  | "colorSafePalette"
  | "largerTouchTargets"
  | "dimBrightness"
  | "simplifiedLayout";

export type AccessibilitySettings = {
  highContrast: boolean;
  fontScale: 1 | 1.15 | 1.3 | 1.5;
  extraSpacing: boolean;
  reduceMotion: boolean;
  colorSafePalette: boolean;
  largerTouchTargets: boolean;
  dimBrightness: boolean;
  simplifiedLayout: boolean;
};

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  highContrast: false,
  fontScale: 1,
  extraSpacing: false,
  reduceMotion: false,
  colorSafePalette: false,
  largerTouchTargets: false,
  dimBrightness: false,
  simplifiedLayout: false,
};

export type ConditionProfile = {
  id: string;
  label: string;
  /** Plain description of what we actually change — no clinical claims. */
  note: string;
  adjustments: Partial<AccessibilitySettings>;
};

export const CONDITION_PROFILES: ConditionProfile[] = [
  {
    id: "night_mode",
    label: "Night mode",
    note: "Dims brightness and reduces blue-heavy white for low-light viewing.",
    adjustments: { dimBrightness: true },
  },
  {
    id: "dyslexia",
    label: "Dyslexia",
    note: "Wider letter and line spacing — the evidence behind dyslexia-friendly reading is mostly about spacing, not a specific font.",
    adjustments: { extraSpacing: true, fontScale: 1.15 },
  },
  {
    id: "visual_fatigue",
    label: "Visual fatigue",
    note: "Larger text, more line spacing, dimmer brightness to reduce eye strain.",
    adjustments: { fontScale: 1.15, extraSpacing: true, dimBrightness: true },
  },
  {
    id: "green_blind",
    label: "Green color blindness (deuteranopia)",
    note: "Switches accent colors to a blue/orange palette that stays distinguishable without red-green contrast.",
    adjustments: { colorSafePalette: true },
  },
  {
    id: "red_blind",
    label: "Red color blindness (protanopia)",
    note: "Same color-safe palette — red/green pairs are replaced app-wide.",
    adjustments: { colorSafePalette: true },
  },
  {
    id: "blue_blind",
    label: "Blue color blindness (tritanopia)",
    note: "Color-safe palette avoiding blue/yellow confusion pairs.",
    adjustments: { colorSafePalette: true },
  },
  {
    id: "senior",
    label: "Senior",
    note: "Larger text and touch targets, higher contrast, simpler screen layouts.",
    adjustments: { fontScale: 1.3, largerTouchTargets: true, highContrast: true, simplifiedLayout: true },
  },
  {
    id: "cataract",
    label: "Cataract",
    note: "High contrast and larger text to compensate for reduced contrast sensitivity.",
    adjustments: { highContrast: true, fontScale: 1.3 },
  },
  {
    id: "visual_impairment",
    label: "Visual impairment",
    note: "Largest text size, high contrast, and simplified layout together.",
    adjustments: { fontScale: 1.5, highContrast: true, simplifiedLayout: true },
  },
  {
    id: "imprecise_movements",
    label: "Imprecise movements",
    note: "Enlarges every tappable target — this is a motor accommodation, not a visual one.",
    adjustments: { largerTouchTargets: true },
  },
  {
    id: "retinal_migraine",
    label: "Retinal migraine",
    note: "Reduces motion/animation and dims brightness, both common migraine triggers.",
    adjustments: { reduceMotion: true, dimBrightness: true },
  },
  {
    id: "parkinsons",
    label: "Parkinson's disease",
    note: "Primarily a motor condition — we offer larger touch targets and reduced motion; we don't claim more than that.",
    adjustments: { largerTouchTargets: true, reduceMotion: true },
  },
  {
    id: "wilsons",
    label: "Wilson's disease",
    note: "Can affect coordination — larger touch targets is the one adjustment we can honestly offer.",
    adjustments: { largerTouchTargets: true },
  },
  {
    id: "amd",
    label: "Age-related macular degeneration (AMD)",
    note: "Large text and high contrast to work around central vision loss.",
    adjustments: { fontScale: 1.5, highContrast: true },
  },
  {
    id: "presbyopia",
    label: "Presbyopia",
    note: "Larger text for close-up reading difficulty.",
    adjustments: { fontScale: 1.3 },
  },
  {
    id: "blue_light",
    label: "Blue light sensitivity",
    note: "Dims brightness and warms the palette.",
    adjustments: { dimBrightness: true },
  },
  {
    id: "multiple_sclerosis",
    label: "Multiple sclerosis",
    note: "Can affect both vision and motor control — we combine reduced motion with larger touch targets.",
    adjustments: { reduceMotion: true, largerTouchTargets: true },
  },
  {
    id: "essential_tremor",
    label: "Essential tremor",
    note: "Larger touch targets to reduce mis-taps.",
    adjustments: { largerTouchTargets: true },
  },
  {
    id: "osteoarthritis",
    label: "Osteoarthritis",
    note: "Larger touch targets, since precise small taps can be harder.",
    adjustments: { largerTouchTargets: true },
  },
  {
    id: "achromatopsia",
    label: "Achromatopsia (total color blindness)",
    note: "High contrast, since color cannot be relied on at all here — everything already has a text label too.",
    adjustments: { highContrast: true, colorSafePalette: true },
  },
  {
    id: "photosensitive_epilepsy",
    label: "Photosensitive epilepsy",
    note: "Turns off all animation/motion. The app has no flashing content, but this removes transitions entirely as a precaution.",
    adjustments: { reduceMotion: true },
  },
  {
    id: "comfort",
    label: "General comfort",
    note: "A mild version of several adjustments — slightly larger text and spacing.",
    adjustments: { fontScale: 1.15, extraSpacing: true },
  },
  {
    id: "low_vision",
    label: "Low vision",
    note: "Largest text, high contrast, larger touch targets together.",
    adjustments: { fontScale: 1.5, highContrast: true, largerTouchTargets: true },
  },
  {
    id: "attention_disorder",
    label: "Attention disorder",
    note: "Simplified layout — hides secondary/decorative content to reduce visual clutter.",
    adjustments: { simplifiedLayout: true, reduceMotion: true },
  },
];
