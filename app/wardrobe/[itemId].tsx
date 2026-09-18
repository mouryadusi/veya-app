import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { getWardrobeInsight } from "@/lib/ai/recommend";
import { resolveWardrobeImage } from "@/lib/demoCloset";
import type { WardrobeCategory, WardrobeItem } from "@/types/database";
import { color, radius, space, type } from "@/theme/tokens";

const CATEGORIES: WardrobeCategory[] = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "traditional"];
const FITS = ["slim", "regular", "relaxed", "oversized"];
const PATTERNS = ["solid", "striped", "plaid", "floral", "print", "checked", "textured", "other"];
const SEASONS = ["spring", "summer", "fall", "winter"];
const STYLE_TAGS = ["minimalist", "classic", "streetwear", "traditional", "preppy", "elegant", "sporty", "vintage"];

export default function WardrobeItemDetail() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const [item, setItem] = useState<WardrobeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightExpanded, setInsightExpanded] = useState(false);

  async function loadInsight() {
    if (!item) return;
    setInsightExpanded(true);
    if (insight) return; // already fetched this visit — don't re-call on re-expand
    setInsightLoading(true);
    setInsightError(null);
    try {
      const result = await getWardrobeInsight(item.id);
      setInsight(result.insight);
    } catch (e: any) {
      setInsightError(e?.message ?? "Couldn't generate a styling insight right now.");
    } finally {
      setInsightLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("wardrobe_items").select("*").eq("id", itemId).single();
      if (!error && data) setItem(data as WardrobeItem);
      setLoading(false);
    })();
  }, [itemId]);

  function update<K extends keyof WardrobeItem>(key: K, value: WardrobeItem[K]) {
    setItem((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleInArray(key: "season_suitability" | "style_tags", value: string) {
    if (!item) return;
    const current = item[key] as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update(key, next as any);
  }

  async function save() {
    if (!item) return;
    setSaving(true);
    const { error } = await supabase
      .from("wardrobe_items")
      .update({
        category: item.category,
        subcategory: item.subcategory,
        primary_color: item.primary_color,
        pattern: item.pattern,
        material: item.material,
        fit: item.fit,
        formality: item.formality,
        season_suitability: item.season_suitability,
        style_tags: item.style_tags,
        warmth_level: item.warmth_level,
        brand: item.brand,
        size: item.size,
        product_url: item.product_url,
        notes: item.notes,
        user_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.back();
  }

  function confirmArchive() {
    Alert.alert("Remove from wardrobe?", "This hides it from outfit recommendations. You can't undo this here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: archive },
    ]);
  }

  async function archive() {
    if (!item) return;
    setSaving(true);
    const { error } = await supabase.from("wardrobe_items").update({ is_archived: true }).eq("id", item.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't remove", error.message);
      return;
    }
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.bone} />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: color.stone }}>Item not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.md }}>
        <Text style={{ color: color.stone }}>← Back</Text>
      </Pressable>

      <Image source={resolveWardrobeImage(item.image_url)} style={styles.image} />

      {item.is_demo && (
        <View style={styles.aiNote}>
          <Text style={[type.caption, { color: color.gold }]}>
            Starter closet item — a placeholder illustration, not a photo of your actual garment. Replace it by adding your own and removing this one.
          </Text>
        </View>
      )}
      {!item.user_verified && !item.is_demo && (
        <View style={styles.aiNote}>
          <Text style={[type.caption, { color: color.gold }]}>
            AI-detected — review these details and correct anything that's off.
          </Text>
        </View>
      )}

      <Pressable onPress={loadInsight} style={styles.insightToggle} disabled={insightLoading}>
        <Text style={[type.caption, { color: color.gold }]}>
          {insightExpanded ? "Hide styling insight" : "Why is this in my wardrobe?"}
        </Text>
      </Pressable>
      {insightExpanded && (
        <View style={styles.insightBox}>
          {insightLoading ? (
            <ActivityIndicator color={color.stone} size="small" />
          ) : insightError ? (
            <Text style={[type.caption, { color: color.danger }]}>{insightError}</Text>
          ) : insight ? (
            <>
              <Text style={[type.body, styles.insightText]}>{insight}</Text>
              <Text style={[type.caption, { color: color.stone, marginTop: space.xs }]}>
                A reasoned guess based on your wardrobe — not a known fact.
              </Text>
            </>
          ) : null}
        </View>
      )}

      <FieldLabel label="Category" />
      <ChipRow options={CATEGORIES} value={item.category} onChange={(v) => update("category", v as WardrobeCategory)} />

      <FieldLabel label="Subcategory" />
      <TextField value={item.subcategory ?? ""} onChangeText={(v) => update("subcategory", v)} placeholder="e.g. button-down shirt" />

      <ConfidenceFieldLabel label="Primary color" level={item.attribute_confidence?.primary_color} />
      <TextField value={item.primary_color ?? ""} onChangeText={(v) => update("primary_color", v)} placeholder="e.g. navy" />

      <ConfidenceFieldLabel label="Pattern" level={item.attribute_confidence?.pattern} />
      <ChipRow options={PATTERNS} value={item.pattern ?? ""} onChange={(v) => update("pattern", v)} />

      <ConfidenceFieldLabel label="Material" level={item.attribute_confidence?.material} />
      <TextField value={item.material ?? ""} onChangeText={(v) => update("material", v)} placeholder="e.g. cotton" />

      <FieldLabel label="Fit" />
      <ChipRow options={FITS} value={item.fit ?? ""} onChange={(v) => update("fit", v)} />

      <FieldLabel label={`Formality: ${item.formality ?? "—"} / 5`} />
      <ChipRow
        options={["1", "2", "3", "4", "5"]}
        value={item.formality ? String(item.formality) : ""}
        onChange={(v) => update("formality", Number(v) as any)}
      />

      <FieldLabel label={`Warmth: ${item.warmth_level ?? "—"} / 5`} />
      <ChipRow
        options={["1", "2", "3", "4", "5"]}
        value={item.warmth_level ? String(item.warmth_level) : ""}
        onChange={(v) => update("warmth_level", Number(v) as any)}
      />

      <FieldLabel label="Season" />
      <ChipRow options={SEASONS} multi values={item.season_suitability} onChangeMulti={(v) => toggleInArray("season_suitability", v)} />

      <FieldLabel label="Style" />
      <ChipRow options={STYLE_TAGS} multi values={item.style_tags} onChangeMulti={(v) => toggleInArray("style_tags", v)} />

      <ConfidenceFieldLabel label="Brand" level={item.attribute_confidence?.brand} />
      <TextField value={item.brand ?? ""} onChangeText={(v) => update("brand", v)} placeholder="Optional — only if a tag/logo is visible" />

      <FieldLabel label="Size" />
      <TextField value={item.size ?? ""} onChangeText={(v) => update("size", v)} placeholder="Optional" />

      <FieldLabel label="Product link" />
      <TextField value={item.product_url ?? ""} onChangeText={(v) => update("product_url", v)} placeholder="Optional" />

      <FieldLabel label="Notes" />
      <TextField value={item.notes ?? ""} onChangeText={(v) => update("notes", v)} placeholder="Optional" multiline />

      <Text style={[type.mono, { color: color.stone, marginTop: space.lg }]}>
        {item.wear_count === 0 ? "NEVER WORN" : `WORN ${item.wear_count}×`}
        {item.last_worn_at ? ` · LAST WORN ${item.last_worn_at}` : ""}
      </Text>

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={color.ink} /> : <Text style={[type.bodyMedium, { color: color.ink }]}>Save changes</Text>}
      </Pressable>

      <Pressable style={styles.archiveBtn} onPress={confirmArchive} disabled={saving}>
        <Text style={[type.bodyMedium, { color: color.danger }]}>Remove from wardrobe</Text>
      </Pressable>
    </ScrollView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={[type.mono, styles.fieldLabel]}>{label.toUpperCase()}</Text>;
}

const CONFIDENCE_COPY: Record<string, { text: string; color: string }> = {
  detected: { text: "Detected", color: color.success },
  highly_likely: { text: "Highly likely", color: color.gold },
  estimated: { text: "Estimated", color: color.stone },
  unknown: { text: "Unknown", color: color.danger },
};

function ConfidenceFieldLabel({
  label,
  level,
}: {
  label: string;
  level?: "detected" | "highly_likely" | "estimated" | "unknown";
}) {
  const badge = level ? CONFIDENCE_COPY[level] : null;
  return (
    <View style={styles.confidenceLabelRow}>
      <Text style={[type.mono, styles.fieldLabel]}>{label.toUpperCase()}</Text>
      {badge && (
        <View style={[styles.confidenceBadge, { borderColor: badge.color }]}>
          <Text style={[type.caption, { color: badge.color, fontSize: 10 }]}>{badge.text}</Text>
        </View>
      )}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={color.stone}
      multiline={multiline}
    />
  );
}

function ChipRow({
  options,
  value,
  values,
  onChange,
  onChangeMulti,
  multi = false,
}: {
  options: string[];
  value?: string;
  values?: string[];
  onChange?: (v: string) => void;
  onChangeMulti?: (v: string) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = multi ? values?.includes(opt) : value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => (multi ? onChangeMulti?.(opt) : onChange?.(opt))}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[type.caption, { color: active ? color.ink : color.bone }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  centered: { flex: 1, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", aspectRatio: 0.85, borderRadius: radius.md, backgroundColor: color.boneDim },
  aiNote: { marginTop: space.sm, padding: space.sm, backgroundColor: color.inkElevated, borderRadius: radius.sm },
  insightToggle: { marginTop: space.sm, alignSelf: "flex-start" },
  insightBox: { marginTop: space.xs, padding: space.sm, backgroundColor: color.inkElevated, borderRadius: radius.sm },
  insightText: { color: color.bone, lineHeight: 21, fontStyle: "italic" },
  fieldLabel: { color: color.stone, marginTop: space.lg, marginBottom: space.xs },
  confidenceLabelRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.lg, marginBottom: space.xs },
  confidenceBadge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  input: {
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: color.bone,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
  },
  chipActive: { backgroundColor: color.bone, borderColor: color.bone },
  saveBtn: { marginTop: space.xl, backgroundColor: color.bone, paddingVertical: 14, borderRadius: radius.pill, alignItems: "center" },
  archiveBtn: { marginTop: space.md, paddingVertical: 14, alignItems: "center" },
});
