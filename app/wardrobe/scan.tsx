import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase/client";
import { analyzeWardrobePhoto, DetectedGarment } from "@/lib/ai/recommend";
import { color, radius, space, type } from "@/theme/tokens";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const MAX_BYTES = 12 * 1024 * 1024;

export default function ScanWardrobe() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [items, setItems] = useState<DetectedGarment[]>([]);
  const [addedIndexes, setAddedIndexes] = useState<Set<number>>(new Set());
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function pickAndDetect(source: "camera" | "library") {
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

    const detectedMime = asset.mimeType ?? (asset.uri.split(".").pop() ? `image/${asset.uri.split(".").pop()!.toLowerCase()}` : null);
    if (detectedMime && !ALLOWED_MIME.includes(detectedMime.toLowerCase())) {
      setErrorMsg("That file type isn't supported — please use a JPEG, PNG, HEIC, or WEBP photo.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setErrorMsg("That photo is too large (max 12MB).");
      return;
    }

    setPhotoUri(asset.uri);
    setItems([]);
    setAddedIndexes(new Set());
    setDetecting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const base64 =
        asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const contentType = detectedMime ?? `image/${ext === "jpg" ? "jpeg" : ext}`;
      const path = `${userData.user.id}/${Date.now()}-scan.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("wardrobe-photos").upload(path, decode(base64), { contentType });
      if (uploadErr) throw uploadErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("wardrobe-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed) throw signErr ?? new Error("Could not sign image URL");

      setPhotoUrl(signed.signedUrl);
      const result2 = await analyzeWardrobePhoto(signed.signedUrl);
      if (result2.items.length === 0) {
        setErrorMsg("Couldn't make out any distinct items in that photo — try a clearer or closer shot.");
      }
      setItems(result2.items);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Couldn't analyze that photo. Try again.");
    } finally {
      setDetecting(false);
    }
  }

  async function addItem(item: DetectedGarment, index: number) {
    if (!photoUrl) return;
    setAddingIndex(index);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase.from("wardrobe_items").insert({
        user_id: userData.user.id,
        image_url: photoUrl,
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
        ai_confidence: item.confidence,
        user_verified: false,
        is_demo: false,
      });
      if (error) throw error;
      setAddedIndexes((prev) => new Set(prev).add(index));
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Couldn't add that item.");
    } finally {
      setAddingIndex(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.lg }}>
        <Text style={{ color: color.stone }}>← Back</Text>
      </Pressable>

      <Text style={[type.h1, { color: color.bone }]}>Scan multiple items</Text>
      <Text style={[type.body, { color: color.stone, marginTop: space.xs, marginBottom: space.lg }]}>
        Point at your closet, a pile of clothes, or several items at once. Veya will do its best to pick out
        individual pieces — real-world photos aren't always perfect, so double-check what it finds.
      </Text>

      {!photoUri ? (
        <View style={styles.addRow}>
          <Pressable style={styles.addBtn} onPress={() => pickAndDetect("camera")}>
            <Feather name="camera" size={18} color={color.ink} style={{ marginBottom: 4 }} />
            <Text style={[type.caption, { color: color.ink }]}>Take photo</Text>
          </Pressable>
          <Pressable style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => pickAndDetect("library")}>
            <Feather name="image" size={18} color={color.bone} style={{ marginBottom: 4 }} />
            <Text style={[type.caption, { color: color.bone }]}>Choose from library</Text>
          </Pressable>
        </View>
      ) : (
        <Image source={{ uri: photoUri }} style={styles.preview} />
      )}

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      {detecting && (
        <View style={styles.detectingRow}>
          <ActivityIndicator color={color.bone} />
          <Text style={[type.caption, { color: color.stone }]}>Looking for individual pieces…</Text>
        </View>
      )}

      {items.length > 0 && (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Text style={[type.mono, { color: color.stone }]}>DETECTED {items.length} ITEM{items.length === 1 ? "" : "S"}</Text>
          {items.map((item, i) => {
            const added = addedIndexes.has(i);
            return (
              <View key={i} style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMedium, { color: color.bone }]}>
                    {[item.primary_color, item.subcategory].filter(Boolean).join(" ")}
                  </Text>
                  <Text style={[type.caption, { color: color.stone, marginTop: 2 }]}>{item.position_hint}</Text>
                  <Text style={[type.caption, { color: color.stone, marginTop: 2 }]}>
                    {Math.round(item.confidence * 100)}% confidence
                  </Text>
                </View>
                <Pressable
                  onPress={() => addItem(item, i)}
                  disabled={added || addingIndex === i}
                  style={[styles.addItemBtn, added && { backgroundColor: color.inkElevated, borderColor: color.border, borderWidth: 1 }]}
                >
                  {addingIndex === i ? (
                    <ActivityIndicator color={color.ink} size="small" />
                  ) : (
                    <Text style={[type.caption, { color: added ? color.stone : color.ink }]}>{added ? "Added" : "Add"}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {items.length > 0 && addedIndexes.size > 0 && (
        <Pressable style={styles.doneBtn} onPress={() => router.replace("/(tabs)/wardrobe")}>
          <Text style={[type.bodyMedium, { color: color.ink }]}>
            Done — {addedIndexes.size} item{addedIndexes.size === 1 ? "" : "s"} added
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  addRow: { flexDirection: "row", gap: space.sm },
  addBtn: { flex: 1, backgroundColor: color.bone, paddingVertical: 16, borderRadius: radius.md, alignItems: "center" },
  addBtnSecondary: { backgroundColor: color.inkElevated, borderWidth: 1, borderColor: color.border },
  preview: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: color.inkElevated },
  error: { color: color.danger, marginTop: space.sm },
  detectingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.inkElevated,
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: color.border,
  },
  addItemBtn: { backgroundColor: color.bone, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.pill },
  doneBtn: { marginTop: space.lg, backgroundColor: color.bone, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center" },
});
