import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, Pressable } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { fetchWardrobeInsights, WardrobeInsights } from "@/lib/insights";
import { resolveWardrobeImage } from "@/lib/demoCloset";
import { color, radius, space, type } from "@/theme/tokens";

export default function Insights() {
  const [data, setData] = useState<WardrobeInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const insights = await fetchWardrobeInsights(userData.user.id);
        if (!cancelled) setData(insights);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (loading || !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.bone} />
      </View>
    );
  }

  if (data.totalItems === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[type.body, { color: color.stone, textAlign: "center", paddingHorizontal: space.xl }]}>
          Add a few wardrobe pieces and wear some outfits — insights build up from there.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[type.h1, { color: color.bone }]}>Your wardrobe, understood</Text>
      <Text style={[type.caption, { color: color.stone, marginTop: space.xs }]}>{data.totalItems} pieces tracked</Text>

      <Section title="Most worn">
        {data.mostWorn.length === 0 ? (
          <EmptyNote text="Mark outfits as worn to see this build up." />
        ) : (
          <Row>
            {data.mostWorn.map((i) => (
              <PieceThumb key={i.id} item={i} caption={`${i.wear_count}×`} />
            ))}
          </Row>
        )}
      </Section>

      <Section title="Never worn">
        {data.neverWorn.length === 0 ? (
          <EmptyNote text="Everything in your wardrobe has been worn at least once." />
        ) : (
          <Row>
            {data.neverWorn.slice(0, 6).map((i) => (
              <PieceThumb key={i.id} item={i} caption="0×" />
            ))}
          </Row>
        )}
      </Section>

      {data.underused.length > 0 && (
        <Section title="Underused">
          <Text style={[type.caption, { color: color.stone, marginBottom: space.sm }]}>
            Owned a while, worn once or twice — worth another look.
          </Text>
          <Row>
            {data.underused.slice(0, 6).map((i) => (
              <PieceThumb key={i.id} item={i} caption={`${i.wear_count}×`} />
            ))}
          </Row>
        </Section>
      )}

      {data.versatile.length > 0 && (
        <Section title="Your most versatile pieces">
          <Text style={[type.caption, { color: color.stone, marginBottom: space.sm }]}>
            Recommended across the widest range of occasions.
          </Text>
          <Row>
            {data.versatile.map((i) => (
              <PieceThumb key={i.id} item={i} caption={`in ${i.timesRecommended} looks`} />
            ))}
          </Row>
        </Section>
      )}

      {data.gaps.length > 0 && (
        <Section title="Wardrobe gaps">
          <Text style={[type.caption, { color: color.stone, marginBottom: space.sm }]}>
            Categories that are thin — Veya's picks lean on these less as a result.
          </Text>
          {data.gaps.map((g) => (
            <View key={g.category} style={styles.gapRow}>
              <Text style={[type.bodyMedium, { color: color.bone, textTransform: "capitalize" }]}>{g.category}</Text>
              <Text style={[type.mono, { color: color.stone }]}>{g.count} owned</Text>
            </View>
          ))}
        </Section>
      )}

      {data.favoriteCombos.length > 0 && (
        <Section title="Favorite combinations">
          {data.favoriteCombos.map((combo) => (
            <View key={combo.outfitId} style={styles.comboRow}>
              <Text style={[type.body, { color: color.bone }]}>
                {combo.pieces.map((p) => [p.primary_color, p.subcategory].filter(Boolean).join(" ")).join(" + ")}
              </Text>
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.h2, { color: color.bone, marginBottom: space.sm }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>{children}</ScrollView>;
}

function PieceThumb({ item, caption }: { item: { id: string; image_url: string; subcategory: string | null }; caption: string }) {
  return (
    <Pressable style={styles.thumbCard} onPress={() => router.push(`/wardrobe/${item.id}`)}>
      <Image source={resolveWardrobeImage(item.image_url)} style={styles.thumb} />
      <Text style={[type.mono, { color: color.stone, marginTop: space.xs }]}>{caption}</Text>
    </Pressable>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <Text style={[type.caption, { color: color.stone }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  centered: { flex: 1, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  section: { marginTop: space.xl },
  thumbCard: { width: 100 },
  thumb: { width: 100, height: 120, borderRadius: radius.sm, backgroundColor: color.boneDim },
  gapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  comboRow: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
