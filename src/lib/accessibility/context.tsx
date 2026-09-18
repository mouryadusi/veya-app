import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccessibilitySettings, DEFAULT_SETTINGS, ConditionProfile, CONDITION_PROFILES } from "./profiles";
import { color as baseColor } from "@/theme/tokens";

const STORAGE_KEY = "veya.accessibility.settings.v1";

// Okabe-Ito palette — chosen because it stays distinguishable across
// deuteranopia, protanopia, and tritanopia, not just "colorblind friendly"
// in a generic sense.
const COLOR_SAFE = {
  plum: "#0072B2", // blue, replaces plum
  gold: "#E69F00", // orange, replaces gold
  danger: "#D55E00", // vermillion, replaces red danger
  success: "#009E73", // bluish green, replaces green success
};

type DerivedTheme = {
  color: typeof baseColor & { plum: string; gold: string; danger: string; success: string };
  fontScale: number;
  lineSpacingMultiplier: number;
  minTouchTarget: number;
  motionEnabled: boolean;
  brightnessOverlayOpacity: number;
  simplified: boolean;
};

type Ctx = {
  settings: AccessibilitySettings;
  loaded: boolean;
  activeProfileIds: string[];
  theme: DerivedTheme;
  toggleProfile: (profile: ConditionProfile) => void;
  updateSetting: <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => void;
  reset: () => void;
};

const AccessibilityContext = createContext<Ctx | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS);
  const [activeProfileIds, setActiveProfileIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
          setActiveProfileIds(parsed.activeProfileIds ?? []);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, activeProfileIds })).catch(() => {});
  }, [settings, activeProfileIds, loaded]);

  function recomputeFromProfiles(ids: string[]) {
    const merged: AccessibilitySettings = { ...DEFAULT_SETTINGS };
    for (const id of ids) {
      const profile = CONDITION_PROFILES.find((p) => p.id === id);
      if (!profile) continue;
      Object.assign(merged, profile.adjustments);
      // fontScale should take the largest requested value across active profiles, not just the last one applied
      if (profile.adjustments.fontScale && profile.adjustments.fontScale > merged.fontScale) {
        merged.fontScale = profile.adjustments.fontScale;
      }
    }
    setSettings(merged);
  }

  function toggleProfile(profile: ConditionProfile) {
    setActiveProfileIds((prev) => {
      const isActive = prev.includes(profile.id);
      const next = isActive ? prev.filter((id) => id !== profile.id) : [...prev, profile.id];
      recomputeFromProfiles(next);
      return next;
    });
  }

  function updateSetting<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setSettings(DEFAULT_SETTINGS);
    setActiveProfileIds([]);
  }

  const theme = useMemo<DerivedTheme>(() => {
    const c = settings.colorSafePalette
      ? { ...baseColor, ...COLOR_SAFE }
      : { ...baseColor, plum: baseColor.plum, gold: baseColor.gold, danger: baseColor.danger, success: baseColor.success };

    const highContrastColor = settings.highContrast
      ? { ...c, ink: "#FFFFFF", bone: "#000000", stone: "#333333", border: "rgba(0,0,0,0.35)" }
      : c;

    return {
      color: highContrastColor,
      fontScale: settings.fontScale,
      lineSpacingMultiplier: settings.extraSpacing ? 1.35 : 1,
      minTouchTarget: settings.largerTouchTargets ? 56 : 44,
      motionEnabled: !settings.reduceMotion,
      brightnessOverlayOpacity: settings.dimBrightness ? 0.16 : 0,
      simplified: settings.simplifiedLayout,
    };
  }, [settings]);

  return (
    <AccessibilityContext.Provider value={{ settings, loaded, activeProfileIds, theme, toggleProfile, updateSetting, reset }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
