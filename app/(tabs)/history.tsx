import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { resolveWardrobeImage } from "@/lib/demoCloset";
import { color, radius, space, type } from "@/theme/tokens";

type HistoryEntry = {
  id: string;
  status: string;
  final_score: number | null;
  explanation: string | null;
  shown_at: string;
  responded_at: string | null;
  occasion_label: string;
  pieces: { id: string; image_url: string; subcategory: string | null; primary_color: string | null; slot: string }[];
};

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "loved" | "worn">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("outfits")
      .select(
        "id, status, final_score, explanation, shown_at, responded_at, outfit_requests(occasion_label), outfit_items(slot, wardrobe_items(id, image_url, subcategory, primary_color)), feedback(signal)"
      )
      .eq("user_id", userData.user.id)
      .eq("status", "worn")
      .order("responded_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped: HistoryEntry[] = (data as any[]).map((o) => {
        const wasLoved = (o.feedback ?? []).some((f: any) => f.signal === "loved");
        return {
          id: o.id,
          status: wasLoved ? "loved" : "worn",
          final_score: o.final_score,
          explanation: o.explanation,
          shown_at: o.shown_at,
          responded_at: o.responded_at,
          occasion_label: o.outfit_requests?.occasion_label ?? "Outfit",
          pieces: (o.outfit_items ?? []).map((oi: any) => ({
            id: oi.wardrobe_items?.id,
            image_url: oi.wardrobe_items?.image_url,
            subcategory: oi.wardrobe_items?.subcategory,
            primary_color: oi.wardrobe_items?.primary_color,
            slot: oi.slot,
          })),
        };
      });
      setEntries(mapped);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = entries.filter((e) => filter === "all" || e.status === filter);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[type.h1, { color: color.bone }]}>Saved outfits</Text>
        <Text style={[type.caption, { color: color.stone }]}>{entries.length} total</Text>
      </View>

      <View style={styles.filterRow}>
        {(["all", "loved", "worn"] as const).map((f) => {
          const accent = f === "loved" ? color.loved : f === "worn" ? color.plum : color.bone;
          const active = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterChip, active && { backgroundColor: accent, borderColor: accent }]}>
              <Text style={[type.caption, { color: active ? "#FFFFFF" : color.bone, textTransform: "capitalize" }]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={color.bone} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[type.body, { color: color.stone, textAlign: "center" }]}>
            {entries.length === 0
              ? "Nothing saved yet. Love an outfit from Home and it'll show up here."
              : "Nothing in this filter yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={[type.bodyMedium, { color: color.bone }]}>{item.occasion_label}</Text>
                <Text style={[type.mono, { color: item.status === "loved" ? color.loved : color.stone }]}>
                  {item.status === "loved" ? "LOVED" : "WORN"}
                </Text>
              </View>
              <View style={styles.piecesRow}>
                {item.pieces.map((p) => (
                  <Image key={p.id} source={resolveWardrobeImage(p.image_url)} style={styles.pieceThumb} />
                ))}
              </View>
              {item.explanation && (
                <Text style={[type.caption, { color: color.stone, marginTop: space.xs, fontStyle: "italic" }]} numberOfLines={2}>
                  {item.explanation}
                </Text>
              )}
              <Text style={[type.mono, { color: color.stone, marginTop: space.xs }]}>
                {new Date(item.responded_at ?? item.shown_at).toLocaleDateString()}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink, paddingTop: space.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: space.lg, marginBottom: space.sm },
  filterRow: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.sm },
  filterChip: { paddingVertical: 8, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.inkElevated },
  filterChipActive: { backgroundColor: color.bone, borderColor: color.bone },
  empty: { marginTop: space.xxl, paddingHorizontal: space.xl },
  card: { backgroundColor: color.inkElevated, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: color.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm },
  piecesRow: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  pieceThumb: { width: 52, height: 62, borderRadius: 8, backgroundColor: color.boneDim },
});
