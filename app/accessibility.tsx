import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAccessibility } from "@/lib/accessibility/context";
import { CONDITION_PROFILES } from "@/lib/accessibility/profiles";
import { space, radius, type as baseType } from "@/theme/tokens";

export default function AccessibilityScreen() {
  const { settings, activeProfileIds, theme, toggleProfile, updateSetting, reset } = useAccessibility();
  const c = theme.color;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.ink }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.lg }}>
        <Text style={{ color: c.stone }}>← Back</Text>
      </Pressable>

      <Text style={[baseType.h1, { color: c.bone, fontSize: 26 * theme.fontScale }]}>Accessibility</Text>
      <Text style={[baseType.body, styles.disclaimer, { color: c.stone, fontSize: 15 * theme.fontScale }]}>
        Veya can't diagnose or medically address any condition. Tapping a profile below turns on a
        combination of real adjustments — contrast, text size, spacing, motion, color palette, touch
        target size — that commonly help. Each one lists exactly what it changes, honestly.
      </Text>

      <View style={styles.section}>
        <Text style={[baseType.h2, { color: c.bone, marginBottom: space.sm }]}>One-tap profiles</Text>
        {CONDITION_PROFILES.map((profile) => {
          const active = activeProfileIds.includes(profile.id);
          return (
            <Pressable
              key={profile.id}
              onPress={() => toggleProfile(profile)}
              style={[
                styles.profileRow,
                { borderColor: c.border, minHeight: theme.minTouchTarget },
                active && { backgroundColor: c.inkElevated, borderColor: c.bone },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[baseType.bodyMedium, { color: c.bone, fontSize: 15 * theme.fontScale }]}>
                  {profile.label}
                </Text>
                <Text style={[baseType.caption, { color: c.stone, marginTop: 2, fontSize: 12 * theme.fontScale }]}>
                  {profile.note}
                </Text>
              </View>
              <View style={[styles.checkbox, { borderColor: c.stone }, active && { backgroundColor: c.bone, borderColor: c.bone }]}>
                {active && <Feather name="check" size={12} color={c.ink} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={[baseType.h2, { color: c.bone, marginBottom: space.sm }]}>Manual adjustments</Text>

        <ToggleRow label="High contrast" value={settings.highContrast} onChange={(v) => updateSetting("highContrast", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Extra text spacing" value={settings.extraSpacing} onChange={(v) => updateSetting("extraSpacing", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Reduce motion" value={settings.reduceMotion} onChange={(v) => updateSetting("reduceMotion", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Color-safe palette" value={settings.colorSafePalette} onChange={(v) => updateSetting("colorSafePalette", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Larger touch targets" value={settings.largerTouchTargets} onChange={(v) => updateSetting("largerTouchTargets", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Dim brightness" value={settings.dimBrightness} onChange={(v) => updateSetting("dimBrightness", v)} c={c} minHeight={theme.minTouchTarget} />
        <ToggleRow label="Simplified layout" value={settings.simplifiedLayout} onChange={(v) => updateSetting("simplifiedLayout", v)} c={c} minHeight={theme.minTouchTarget} />

        <Text style={[baseType.caption, { color: c.stone, marginTop: space.md, fontSize: 12 * theme.fontScale }]}>
          Text size: {Math.round(settings.fontScale * 100)}%
        </Text>
        <View style={styles.chipRow}>
          {[1, 1.15, 1.3, 1.5].map((scale) => (
            <Pressable
              key={scale}
              onPress={() => updateSetting("fontScale", scale as any)}
              style={[
                styles.scaleChip,
                { borderColor: c.border, minHeight: theme.minTouchTarget },
                settings.fontScale === scale && { backgroundColor: c.bone, borderColor: c.bone },
              ]}
            >
              <Text style={{ color: settings.fontScale === scale ? c.ink : c.bone }}>{Math.round(scale * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable onPress={reset} style={styles.resetBtn}>
        <Text style={{ color: c.danger }}>Reset all accessibility settings</Text>
      </Pressable>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  c,
  minHeight,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  c: any;
  minHeight: number;
}) {
  return (
    <View style={[styles.toggleRow, { borderColor: c.border, minHeight }]}>
      <Text style={{ color: c.bone }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.plum, false: c.border }} thumbColor={c.bone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  disclaimer: { marginTop: space.sm, marginBottom: space.xl, lineHeight: 21 },
  section: { marginTop: space.lg },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  chipRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  scaleChip: { paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  resetBtn: { marginTop: space.xl, alignItems: "center", paddingVertical: space.md },
});
