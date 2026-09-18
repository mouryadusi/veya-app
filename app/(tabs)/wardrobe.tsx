import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator, TextInput } from "react-native";
import { useFocusEffect, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase/client";
import { analyzeGarment } from "@/lib/ai/recommend";
import { resolveWardrobeImage } from "@/lib/demoCloset";
import { categoryColor } from "@/theme/categoryColors";
import type { WardrobeItem } from "@/types/database";
import { color, radius, space, type } from "@/theme/tokens";

export default function Wardrobe() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    if (!error && data) setItems(data as WardrobeItem[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function pickAndUpload(source: "camera" | "library") {
    setErrorMsg(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg("Permission needed to add a photo.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // Client-side check for fast, clear feedback — NOT the real security
    // boundary (a modified client could skip this entirely). The actual
    // enforcement is the storage bucket's file_size_limit/allowed_mime_types
    // config, which rejects the upload server-side regardless.
    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"];
    const MAX_BYTES = 12 * 1024 * 1024;
    const detectedMime = asset.mimeType ?? (asset.uri.match(/\.(\w+)$/)?.[1] ? `image/${asset.uri.split(".").pop()!.toLowerCase()}` : null);
    if (detectedMime && !ALLOWED_MIME.includes(detectedMime.toLowerCase())) {
      setErrorMsg("That file type isn't supported — please use a JPEG, PNG, HEIC, or WEBP photo.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setErrorMsg("That photo is too large (max 12MB) — try a lower resolution or a fresh photo.");
      return;
    }

    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const base64 =
        asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const contentType = detectedMime ?? `image/${ext === "jpg" ? "jpeg" : ext}`;
      const path = `${userData.user.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("wardrobe-photos")
        .upload(path, decode(base64), { contentType });
      if (uploadErr) throw uploadErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("wardrobe-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year, refreshed on read elsewhere in a full build
      if (signErr || !signed) throw signErr ?? new Error("Could not sign image URL");

      const { data: inserted, error: insertErr } = await supabase
        .from("wardrobe_items")
        .insert({
          user_id: userData.user.id,
          image_url: signed.signedUrl,
          category: "top", // placeholder until AI analysis returns; user can correct
          is_demo: false,
        })
        .select()
        .single();
      if (insertErr || !inserted) throw insertErr ?? new Error("Could not save item");

      setItems((prev) => [inserted as WardrobeItem, ...prev]);

      // Fire AI vision analysis — updates the row server-side; refresh after.
      await analyzeGarment({ wardrobe_item_id: inserted.id, image_url: signed.signedUrl });
      await load();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const demoCount = items.filter((i) => i.is_demo).length;

  const categories = Array.from(new Set(items.map((i) => i.category))).sort();

  const filtered = items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const haystack = [item.primary_color, item.subcategory, item.category, item.material, ...(item.style_tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[type.h1, { color: color.bone }]}>Your wardrobe</Text>
        <Text style={[type.caption, { color: color.stone }]}>{items.length} pieces</Text>
      </View>
      {demoCount > 0 && (
        <Text style={[type.caption, { color: color.gold, marginBottom: space.sm }]}>
          {demoCount} starter piece{demoCount === 1 ? "" : "s"} — swap these for your own anytime.
        </Text>
      )}

      <View style={styles.addRow}>
        <Pressable style={styles.addBtn} onPress={() => pickAndUpload("camera")} disabled={uploading}>
          <Feather name="camera" size={16} color={color.ink} style={{ marginBottom: 4 }} />
          <Text style={[type.caption, { color: color.ink }]}>Take photo</Text>
        </Pressable>
        <Pressable style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => pickAndUpload("library")} disabled={uploading}>
          <Feather name="image" size={16} color={color.bone} style={{ marginBottom: 4 }} />
          <Text style={[type.caption, { color: color.bone }]}>Library</Text>
        </Pressable>
        <Pressable
          style={[styles.addBtn, styles.addBtnSecondary]}
          onPress={() => router.push("/wardrobe/add-from-url")}
          disabled={uploading}
        >
          <Feather name="link" size={16} color={color.bone} style={{ marginBottom: 4 }} />
          <Text style={[type.caption, { color: color.bone }]}>Add link</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push("/wardrobe/scan")} style={styles.scanLink} disabled={uploading}>
        <Feather name="camera" size={13} color={color.gold} />
        <Text style={[type.caption, { color: color.gold }]}>Got several items in one photo? Scan them all →</Text>
      </Pressable>

      {uploading && (
        <View style={styles.uploadingRow}>
          <ActivityIndicator color={color.bone} />
          <Text style={[type.caption, { color: color.stone }]}>Reading the garment…</Text>
        </View>
      )}
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      {items.length > 0 && (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search color, type, style…"
            placeholderTextColor={color.stone}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {categories.length > 1 && (
            <FlatList
              horizontal
              data={["all", ...categories]}
              keyExtractor={(c) => c}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.xs, marginBottom: space.sm }}
              renderItem={({ item: c }) => {
                const active = c === "all" ? categoryFilter === null : categoryFilter === c;
                const accent = c === "all" ? color.plum : categoryColor(c);
                return (
                  <Pressable
                    onPress={() => setCategoryFilter(c === "all" ? null : c)}
                    style={[styles.filterChip, active && { backgroundColor: accent, borderColor: accent }]}
                  >
                    <Text style={[type.caption, { color: active ? "#FFFFFF" : color.bone, textTransform: "capitalize" }]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={color.bone} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[type.body, { color: color.stone, textAlign: "center" }]}>
            Nothing here yet. Add a few pieces — Veya learns your wardrobe as you go.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[type.body, { color: color.stone, textAlign: "center" }]}>
            Nothing matches "{query}"{categoryFilter ? ` in ${categoryFilter}` : ""}. Try a different search.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: space.sm }}
          contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/wardrobe/${item.id}`)}>
              <View>
                <Image source={resolveWardrobeImage(item.image_url)} style={styles.thumb} />
                {item.is_demo && (
                  <View style={styles.demoBadge}>
                    <Text style={[type.mono, { color: color.ink, fontSize: 10 }]}>DEMO</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardTextRow}>
                <View style={[styles.categoryDot, { backgroundColor: categoryColor(item.category) }]} />
                <Text style={[type.caption, { color: color.bone }]} numberOfLines={1}>
                  {[item.primary_color, item.subcategory ?? item.category].filter(Boolean).join(" ")}
                </Text>
              </View>
              <Text style={[type.mono, { color: color.stone }]}>
                {item.wear_count === 0 ? "never worn" : `worn ${item.wear_count}×`}
              </Text>
              {!item.user_verified && !item.is_demo && <Text style={[type.mono, styles.unverifiedBadge]}>NEEDS REVIEW</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink, padding: space.lg, paddingTop: space.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: space.md },
  addRow: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  scanLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.md, alignSelf: "flex-start" },
  addBtn: { flex: 1, backgroundColor: color.bone, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  addBtnSecondary: { backgroundColor: color.inkElevated, borderWidth: 1, borderColor: color.border },
  uploadingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  error: { color: color.gold, marginBottom: space.sm },
  searchInput: {
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    color: color.bone,
    fontSize: 15,
    marginBottom: space.sm,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
  },
  filterChipActive: { backgroundColor: color.bone, borderColor: color.bone },
  empty: { marginTop: space.xxl, paddingHorizontal: space.lg },
  card: { flex: 1, backgroundColor: color.inkElevated, borderRadius: radius.md, padding: space.sm },
  thumb: { width: "100%", aspectRatio: 0.85, borderRadius: radius.sm, backgroundColor: color.boneDim },
  demoBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: color.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  unverifiedBadge: { color: color.gold, marginTop: 2 },
  cardTextRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: space.xs },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
});
