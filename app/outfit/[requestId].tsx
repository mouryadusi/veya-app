import { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, ScrollView, Image, TextInput, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Feather } from "@expo/vector-icons";
import { formatGarmentName } from "@/lib/formatGarmentName";
import { resolveWardrobeImage } from "@/lib/demoCloset";
import { useAccessibility } from "@/lib/accessibility/context";
import {
  OutfitResult,
  RecommendResponse,
  sendFeedback,
  tryAnotherOutfit,
  askAboutOutfit,
} from "@/lib/ai/recommend";
import { color, radius, space, type, motion } from "@/theme/tokens";

const SLOT_ORDER: (keyof OutfitResult["items"])[] = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"];
const SLOT_LABEL: Record<string, string> = {
  outerwear: "Layer",
  top: "Top",
  dress: "Dress",
  bottom: "Bottom",
  shoes: "Shoes",
  accessory: "Accessory",
};

export default function OutfitReveal() {
  const params = useLocalSearchParams<{ requestId: string; initial: string; context: string }>();
  const initial: RecommendResponse = useMemo(() => JSON.parse(params.initial), [params.initial]);
  const context: {
    occasion_label: string;
    special_note?: string;
    location_lat?: number;
    location_lng?: number;
  } = useMemo(() => JSON.parse(params.context), [params.context]);

  const [current, setCurrent] = useState<OutfitResult>(initial.top_outfit);
  const [wardrobeContext, setWardrobeContext] = useState(initial.wardrobe_assessment);
  const [pool, setPool] = useState<OutfitResult[]>(initial.alternatives);
  const [seenItemIds, setSeenItemIds] = useState<string[]>(itemIds(initial.top_outfit));
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<null | "loved" | "disliked">(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [measuredDetailHeight, setMeasuredDetailHeight] = useState(0);
  const detailHeight = useRef(new Animated.Value(0)).current;
  const detailOpacity = useRef(new Animated.Value(0)).current;

  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const slideX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const { theme } = useAccessibility();

  function itemIds(o: OutfitResult): string[] {
    return Object.values(o.items)
      .filter(Boolean)
      .map((i: any) => i.id);
  }

  function animateSwap(next: () => void) {
    // A new outfit means the previous one's expanded reasoning no longer
    // applies — collapse it before/with the swap either way.
    setDetailExpanded(false);
    detailHeight.setValue(0);
    detailOpacity.setValue(0);
    // Same logic for conversation state — a follow-up history about outfit A
    // shouldn't silently carry over once outfit B is on screen (Try Another/
    // Not for me also route through here, not just follow-up modifications).
    setFollowUpHistory([]);
    setFollowUpAnswer(null);
    setFollowUpError(null);

    if (!theme.motionEnabled) {
      // Reduced motion: swap instantly, no slide/fade.
      next();
      return;
    }
    Animated.parallel([
      Animated.timing(slideX, { toValue: -60, duration: motion.hangerSlide.duration / 2, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: motion.hangerSlide.duration / 2, useNativeDriver: true }),
    ]).start(() => {
      next();
      slideX.setValue(60);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: motion.hangerSlide.duration / 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: motion.hangerSlide.duration / 2, useNativeDriver: true }),
      ]).start();
    });
  }

  function toggleDetail() {
    const opening = !detailExpanded;
    setDetailExpanded(opening);
    const targetHeight = opening ? measuredDetailHeight : 0;
    if (!theme.motionEnabled) {
      detailHeight.setValue(targetHeight);
      detailOpacity.setValue(opening ? 1 : 0);
      return;
    }
    // Height animations can't use the native driver — this stays JS-thread,
    // which is fine for a single occasional expand/collapse, not a
    // continuous gesture.
    Animated.parallel([
      Animated.timing(detailHeight, { toValue: targetHeight, duration: 260, useNativeDriver: false }),
      Animated.timing(detailOpacity, { toValue: opening ? 1 : 0, duration: opening ? 300 : 150, useNativeDriver: false }),
    ]).start();
  }

  // Shared "show the next outfit" logic — deliberately sends NO feedback
  // itself. Both handleTryAnother and handleNotForMe send their own single,
  // distinct feedback signal, then call this.
  async function advanceToNextOutfit() {
    if (pool.length > 0) {
      const [nextOutfit, ...rest] = pool;
      animateSwap(() => {
        setCurrent(nextOutfit);
        setPool(rest);
        setSeenItemIds((prev) => [...prev, ...itemIds(nextOutfit)]);
      });
      return;
    }
    try {
      // Wardrobe pool exhausted for this shortlist — ask the pipeline for a fresh
      // batch, excluding everything already shown this session.
      const result = await tryAnotherOutfit({ ...context, excludeItemIds: seenItemIds });
      animateSwap(() => {
        setCurrent(result.top_outfit);
        setPool(result.alternatives);
        setSeenItemIds((prev) => [...prev, ...itemIds(result.top_outfit)]);
        setWardrobeContext(result.wardrobe_assessment);
      });
    } catch {
      // Truly out of combinations. "disliked" is the finished-state type's
      // only exhaustion value (matches the original behavior) — it's the
      // generic "show the exhausted-wardrobe screen" marker, not literally
      // tied to the disliked action.
      setFinished("disliked");
    }
  }

  async function handleTryAnother() {
    setBusy(true);
    setFollowUpAnswer(null);
    setFollowUpError(null);
    try {
      await sendFeedback(current.id, "try_another");
      await advanceToNextOutfit();
    } finally {
      setBusy(false);
    }
  }

  async function sendFollowUp(text: string) {
    const question = text.trim();
    if (!question) return;
    setFollowUpLoading(true);
    setFollowUpError(null);
    setFollowUpAnswer(null);
    try {
      const result = await askAboutOutfit(current.id, question, followUpHistory);
      setFollowUpAnswer(result.answer);
      setFollowUpHistory((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: result.answer }].slice(-6));
      if (result.action !== "explain" && result.updated_outfit) {
        // A real modification (swap/formality adjustment) — apply it the
        // same way advanceToNextOutfit does: animate to the new top pick,
        // replace the pool, and extend seenItemIds so future Try Another
        // calls still avoid repeats.
        animateSwap(() => {
          setCurrent(result.updated_outfit!.top_outfit);
          setPool(result.updated_outfit!.alternatives);
          setSeenItemIds((prev) => [...prev, ...itemIds(result.updated_outfit!.top_outfit)]);
          setWardrobeContext(result.updated_outfit!.wardrobe_assessment);
        });
      }
      setFollowUpQuestion("");
    } catch (e: any) {
      setFollowUpError(e?.message ?? "Couldn't process that question right now.");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function handleAskQuestion() {
    await sendFollowUp(followUpQuestion);
  }

  async function handleLove() {
    setBusy(true);
    try {
      await sendFeedback(current.id, "loved");
      const { error } = await supabase.rpc("mark_outfit_worn", { p_outfit_id: current.id });
      if (error) throw error;
      setFinished("loved");
    } finally {
      setBusy(false);
    }
  }

  async function handleNotForMe() {
    setBusy(true);
    setFollowUpAnswer(null);
    setFollowUpError(null);
    try {
      await sendFeedback(current.id, "disliked");
      await advanceToNextOutfit();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: color.stone }}>← Back</Text>
      </Pressable>

      {finished === "loved" ? (
        <View style={styles.centered}>
          <Text style={[type.hero, { color: color.loved, textAlign: "center" }]}>Loved it.</Text>
          <Text style={[type.body, { color: color.stone, textAlign: "center", marginTop: space.sm }]}>
            Saved — Veya will lean into pieces like this next time.
          </Text>
          <Pressable style={styles.doneCta} onPress={() => router.push("/(tabs)")}>
            <Text style={[type.bodyMedium, { color: color.ink }]}>Done</Text>
          </Pressable>
        </View>
      ) : finished === "disliked" ? (
        <View style={styles.centered}>
          <Text style={[type.h1, { color: color.bone, textAlign: "center" }]}>
            That's everything your wardrobe offers for this one.
          </Text>
          <Text style={[type.body, { color: color.stone, textAlign: "center", marginTop: space.sm }]}>
            Add a few more pieces and Veya will have more looks to try.
          </Text>
          <Pressable style={styles.doneCta} onPress={() => router.push("/(tabs)/wardrobe")}>
            <Text style={[type.bodyMedium, { color: color.ink }]}>Add to wardrobe</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[type.h1, { color: color.bone, marginBottom: space.xs }]}>
            {current.quality === "weak"
              ? "The best your wardrobe supports"
              : current.quality === "limited"
                ? "A solid option, wardrobe permitting"
                : "This outfit works"}
          </Text>
          {wardrobeContext && wardrobeContext.missing_categories.length > 0 && (
            <Pressable onPress={() => router.push("/(tabs)/wardrobe")} style={styles.wardrobeGapBanner}>
              <Feather name="alert-circle" size={14} color={color.gold} />
              <Text style={[type.caption, { color: color.gold, flex: 1, marginLeft: 6 }]}>
                Your wardrobe has no {wardrobeContext.missing_categories.join(" or ")} yet — adding some would open up better options here.
              </Text>
            </Pressable>
          )}
          <Animated.View style={{ opacity, transform: [{ translateX: slideX }], gap: space.sm }}>
            {SLOT_ORDER.map((slot) => {
              const item = current.items[slot];
              if (!item) return null;
              return (
                <Pressable
                  key={slot}
                  style={styles.pieceRow}
                  onPress={() => item.id && router.push(`/wardrobe/${item.id}`)}
                >
                  {item.image_url ? (
                    <Image source={resolveWardrobeImage(item.image_url)} style={styles.pieceThumb} />
                  ) : (
                    <View style={[styles.pieceThumb, styles.pieceThumbPlaceholder]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyMedium, { color: color.bone }]}>{formatGarmentName(item)}</Text>
                    <Text style={[type.mono, { color: color.stone, marginTop: 2 }]}>{SLOT_LABEL[slot]}</Text>
                  </View>
                  <Text style={{ color: color.stone }}>›</Text>
                </Pressable>
              );
            })}
          </Animated.View>

          <Text style={[type.body, styles.explanation]}>{current.explanation}</Text>
          {current.explanation_source === "fallback" && (
            <Text style={[type.caption, { color: color.stone, marginTop: 4 }]}>
              Basic styling logic — full AI reasoning is temporarily unavailable.
            </Text>
          )}

          {current.explanation_detail && (
            <>
              <Pressable onPress={toggleDetail} style={styles.detailToggle} hitSlop={8}>
                <Text style={[type.caption, { color: color.gold }]}>
                  {detailExpanded ? "Show less" : "Why this works, in depth"}
                </Text>
                <Feather name={detailExpanded ? "chevron-up" : "chevron-down"} size={14} color={color.gold} />
              </Pressable>
              <Animated.View style={{ height: detailHeight, opacity: detailOpacity, overflow: "hidden" }}>
                <View
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0 && Math.abs(h - measuredDetailHeight) > 1) setMeasuredDetailHeight(h);
                  }}
                >
                  <Text style={[type.body, styles.explanationDetail]}>{current.explanation_detail}</Text>
                </View>
              </Animated.View>
            </>
          )}

          <View style={styles.askBox}>
            <Text style={[type.mono, { color: color.stone, marginBottom: space.xs }]}>ASK ABOUT THIS OUTFIT</Text>

            <View style={styles.quickActionRow}>
              {[
                { label: "Why this?", text: "Why did you choose this outfit?" },
                { label: "More formal", text: "Make this more formal." },
                { label: "Less formal", text: "Make this less formal." },
                { label: "Warmer", text: "I need something warmer." },
                { label: "Cooler", text: "I need something cooler for the weather." },
                { label: "Swap shoes", text: "Change the shoes." },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  disabled={followUpLoading}
                  onPress={() => sendFollowUp(action.text)}
                  style={[styles.quickChip, followUpLoading && { opacity: 0.5 }]}
                >
                  <Text style={[type.caption, { color: color.bone }]}>{action.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.askRow}>
              <TextInput
                value={followUpQuestion}
                onChangeText={setFollowUpQuestion}
                placeholder="Why not my black trousers? Make this less formal…"
                placeholderTextColor={color.stone}
                style={styles.askInput}
                editable={!followUpLoading}
                returnKeyType="send"
                onSubmitEditing={handleAskQuestion}
              />
              <Pressable
                onPress={handleAskQuestion}
                disabled={followUpLoading || !followUpQuestion.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send question"
                accessibilityState={{ disabled: followUpLoading || !followUpQuestion.trim() }}
                style={[styles.askSendBtn, (followUpLoading || !followUpQuestion.trim()) && { opacity: 0.4 }]}
              >
                {followUpLoading ? <ActivityIndicator size="small" color={color.ink} /> : <Feather name="arrow-up" size={16} color={color.ink} />}
              </Pressable>
            </View>
            {followUpError && <Text style={[type.caption, { color: color.danger, marginTop: space.xs }]}>{followUpError}</Text>}
            {followUpAnswer && (
              <Text style={[type.body, styles.followUpAnswer]}>{followUpAnswer}</Text>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={handleNotForMe} style={[styles.actionBtn, styles.ghost]}>
              <Text style={[type.bodyMedium, { color: color.bone }]}>Not for me</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={handleTryAnother} style={[styles.actionBtn, styles.secondary]}>
              <Text style={[type.bodyMedium, { color: color.bone }]}>Try another</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={handleLove} style={[styles.actionBtn, styles.primary]}>
              <Text style={[type.bodyMedium, { color: "#FFFFFF" }]}>Love it</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl, flexGrow: 1 },
  back: { marginBottom: space.lg },
  pieceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  pieceThumb: { width: 52, height: 62, borderRadius: radius.sm, backgroundColor: color.boneDim },
  pieceThumbPlaceholder: { borderWidth: 1, borderColor: color.border },
  explanation: { color: color.stone, marginTop: space.lg, fontStyle: "italic" },
  detailToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.sm, alignSelf: "flex-start" },
  explanationDetail: { color: color.stone, marginTop: space.sm, lineHeight: 22 },
  wardrobeGapBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.md,
  },
  askBox: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: color.border },
  quickActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: space.sm },
  quickChip: {
    paddingVertical: 7,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
  },
  askRow: { flexDirection: "row", gap: space.xs, alignItems: "center" },
  askInput: {
    flex: 1,
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: color.bone,
    fontSize: 14,
  },
  askSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  followUpAnswer: { color: color.bone, marginTop: space.sm, lineHeight: 21 },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xl },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: "center" },
  ghost: { backgroundColor: color.inkElevated, borderWidth: 1, borderColor: color.border },
  secondary: { backgroundColor: color.plum },
  primary: { backgroundColor: color.loved },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: space.xxl },
  doneCta: {
    marginTop: space.xl,
    backgroundColor: color.bone,
    paddingVertical: 14,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
});
