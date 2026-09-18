import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Linking } from "react-native";
import { router } from "expo-router";
import { callFunction } from "@/lib/ai/recommend";
import { retailersForCountry, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from "@/lib/retailers";
import { color, radius, space, type } from "@/theme/tokens";

// No extra native dependency for this — the device locale's region subtag
// (e.g. "en-IN" -> "IN") is available from the JS Intl API directly and is
// a reasonable default. It's a starting guess, not a hard detection: the
// country picker below lets the user override it in one tap.
function guessCountryFromLocale(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const match = locale.match(/-([A-Z]{2})$/);
    return match ? match[1] : DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

export default function AddFromUrl() {
  const [country, setCountry] = useState(guessCountryFromLocale());
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const retailers = useMemo(() => retailersForCountry(country), [country]);

  async function handleImport() {
    if (!url.trim()) {
      setErrorMsg("Paste a product link first.");
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await callFunction<{ item: { id: string }; source_site: string }>("extract-product", {
        product_url: url.trim(),
      });
      router.replace(`/wardrobe/${result.item.id}`);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Couldn't read that link. Try adding the item manually instead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.lg }}>
        <Text style={{ color: color.stone }}>← Back</Text>
      </Pressable>

      <Text style={[type.h1, { color: color.bone }]}>Add from a link</Text>
      <Text style={[type.body, { color: color.stone, marginTop: space.xs, marginBottom: space.lg }]}>
        Paste a product page link and Veya will pull the photo and details automatically.
      </Text>

      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://…"
        placeholderTextColor={color.stone}
        style={styles.urlInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={handleImport}
      />
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      <Pressable style={[styles.importBtn, loading && { opacity: 0.6 }]} onPress={handleImport} disabled={loading}>
        {loading ? <ActivityIndicator color={color.ink} /> : <Text style={[type.bodyMedium, { color: color.ink }]}>Import item</Text>}
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.countryRow}>
        <Text style={[type.mono, { color: color.stone }]}>SHOPPING IN</Text>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          {SUPPORTED_COUNTRIES.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => setCountry(c.code)}
              style={[styles.countryChip, country === c.code && styles.countryChipActive]}
            >
              <Text style={[type.caption, { color: country === c.code ? color.ink : color.bone }]}>{c.code}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={[type.caption, { color: color.stone, marginTop: space.xs, marginBottom: space.md }]}>
        Don't have a link yet? Open a retailer, find something, then copy its product page link back here.
      </Text>

      <View style={styles.retailerGrid}>
        {retailers.map((r) => (
          <Pressable key={r.name} onPress={() => Linking.openURL(r.url)} style={styles.retailerChip}>
            <Text style={[type.caption, { color: color.bone }]}>{r.name}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.back()}
          style={[styles.retailerChip, { borderStyle: "dashed" }]}
        >
          <Text style={[type.caption, { color: color.stone }]}>Other — add manually instead</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  urlInput: {
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: color.bone,
    fontSize: 15,
  },
  error: { color: color.danger, marginTop: space.sm },
  importBtn: {
    marginTop: space.md,
    backgroundColor: color.bone,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  divider: { height: 1, backgroundColor: color.border, marginVertical: space.xl },
  countryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  countryChip: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  countryChipActive: { backgroundColor: color.bone, borderColor: color.bone },
  retailerGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  retailerChip: {
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
  },
});
