import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Animated, Image, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { requestOutfit } from "@/lib/ai/recommend";
import { supabase } from "@/lib/supabase/client";
import { useAccessibility } from "@/lib/accessibility/context";
import { color, radius, space, type } from "@/theme/tokens";

// Curated, editorial-toned accent per occasion — used intentionally (one
// color cue per category) rather than a wash of random bright color. Muted
// enough to stay premium, distinct enough to give the grid real visual
// rhythm instead of every card looking identical.
const OCCASIONS: { label: string; icon: keyof typeof Feather.glyphMap; accent: string }[] = [
  { label: "Work", icon: "briefcase", accent: "#4A5578" },
  { label: "Interview", icon: "clipboard", accent: "#3D4A5C" },
  { label: "Date", icon: "heart", accent: "#B34A5C" },
  { label: "Movie", icon: "film", accent: "#5C4A78" },
  { label: "Dinner", icon: "coffee", accent: "#8C5A3C" },
  { label: "Party", icon: "music", accent: "#B8863C" },
  { label: "Wedding", icon: "gift", accent: "#A88B3C" },
  { label: "Travel", icon: "map-pin", accent: "#3C7A8C" },
  { label: "Beach", icon: "sun", accent: "#3C9AA8" },
  { label: "College", icon: "book-open", accent: "#5C7A4A" },
  { label: "Gym", icon: "activity", accent: "#4A8C5C" },
  { label: "Family Event", icon: "users", accent: "#8C6A4A" },
];

export default function Home() {
  const [selected, setSelected] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const { theme } = useAccessibility();
  const { width } = useWindowDimensions();
  // Wider viewports (tablet/desktop web) get a capped content width instead
  // of the grid stretching into oversized cards edge-to-edge.
  const contentMaxWidth = Math.min(width, 640);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(12)).current;

  // Root-cause fix, not a rendering patch: this is a TAB screen, kept
  // mounted by Expo Router rather than remounted on navigation. A plain
  // useEffect([]) only ran once, at first mount, before any saved name
  // existed — so after saving a name in Edit Profile and returning here,
  // the screen never re-fetched and kept showing "Add your name" forever.
  // Also fixed a second, related bug while here: neither branch reset the
  // OTHER flag, so if a name were ever cleared after being set, firstName
  // would stay stale forever (the render checks it before nameMissing).
  // Both flags are now always explicitly set on every fetch.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userData.user.id)
          .single();
        const name = profile?.display_name?.trim();
        if (name) {
          setFirstName(name.split(" ")[0]);
          setNameMissing(false);
        } else {
          // Never fall back to the email address — an inbox handle isn't a
          // name, and showing "Hey, mourya123!" reads as broken, not friendly.
          setFirstName(null);
          setNameMissing(true);
        }
      })();
    }, [])
  );

  useEffect(() => {
    if (!theme.motionEnabled) {
      fadeIn.setValue(1);
      slideUp.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]).start();
  }, [firstName, nameMissing]);

  const occasionLabel = selected === "Custom" ? customLabel.trim() : selected;
  const selectedAccent = OCCASIONS.find((o) => o.label === selected)?.accent ?? color.plum;

  async function findOutfit() {
    if (!occasionLabel) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      let locationLabel: string | undefined;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        try {
          // Native OS reverse geocoding (Apple/Google) — no new vendor, no
          // API key, and it's real device-reported data, not a guess. A
          // failure here shouldn't block outfit generation, since weather
          // (which does the actual heavy lifting) already has lat/lng.
          const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const place = places[0];
          if (place) {
            locationLabel = [place.city ?? place.subregion, place.country].filter(Boolean).join(", ") || undefined;
          }
        } catch {
          // Reverse geocoding is a nice-to-have for cultural/regional
          // context — never block the recommendation if it fails.
        }
      }

      const result = await requestOutfit({
        occasion_label: occasionLabel,
        special_note: specialNote.trim() || undefined,
        location_lat: lat,
        location_lng: lng,
        location_label: locationLabel,
      });

      router.push({
        pathname: "/outfit/[requestId]",
        params: {
          requestId: result.request_id,
          initial: JSON.stringify(result),
          context: JSON.stringify({
            occasion_label: occasionLabel,
            special_note: specialNote.trim() || undefined,
            location_lat: lat,
            location_lng: lng,
            location_label: locationLabel,
          }),
        },
      });
    } catch (e: any) {
      const message = e?.message ?? "";
      if (message.includes("empty_wardrobe") || message.includes("No wardrobe items")) {
        setErrorMsg("Your wardrobe is empty — add a few pieces first.");
      } else if (message.includes("insufficient_wardrobe") || message.includes("Not enough compatible")) {
        setErrorMsg("Not enough pieces yet to build this outfit — add a few more items.");
      } else if (message.includes("Not signed in") || message.includes("Invalid or expired session")) {
        setErrorMsg("Your session expired — please sign in again.");
      } else if (message) {
        setErrorMsg(message);
      } else {
        setErrorMsg("Couldn't reach Veya's stylist. Try again in a moment.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={{ width: "100%", maxWidth: contentMaxWidth, alignSelf: "center", paddingHorizontal: space.lg }}>
        {/* Hero: logo + a single intentional gradient wash behind the greeting —
            one deliberate color moment, not color scattered everywhere. */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={["rgba(176,138,46,0.16)", "rgba(176,138,46,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGlow}
            pointerEvents="none"
          />
          <Image
            source={require("../../assets/brand/wordmark-transparent.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideUp }] }}>
            {firstName ? (
              <Text style={[type.body, styles.greeting]}>Hey, {firstName}!</Text>
            ) : nameMissing ? (
              <Pressable onPress={() => router.push("/edit-profile")} style={styles.namePrompt}>
                <Text style={[type.body, styles.greeting]}>Hey there!</Text>
                <Text style={[type.caption, styles.namePromptLink]}>Add your name →</Text>
              </Pressable>
            ) : (
              <View style={{ height: 21 }} />
            )}
            <Text style={[type.hero, styles.heroTitle]}>Where are{"\n"}you going?</Text>
          </Animated.View>
        </View>

        <View style={styles.grid}>
          {OCCASIONS.map(({ label, icon, accent }) => {
            const active = selected === label;
            return (
              <Pressable
                key={label}
                onPress={() => setSelected(label)}
                style={[styles.card, active && { backgroundColor: accent, borderColor: accent }]}
              >
                <View style={[styles.iconDot, { backgroundColor: active ? "rgba(255,255,255,0.22)" : accent + "26" }]}>
                  <Feather name={icon} size={16} color={active ? "#FFFFFF" : accent} />
                </View>
                <Text style={[type.bodyMedium, { color: active ? "#FFFFFF" : color.bone }]}>{label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setSelected("Custom")}
            style={[styles.card, selected === "Custom" && { backgroundColor: color.plum, borderColor: color.plum }]}
          >
            <View style={[styles.iconDot, { backgroundColor: selected === "Custom" ? "rgba(255,255,255,0.22)" : color.plum + "26" }]}>
              <Feather name="plus-circle" size={16} color={selected === "Custom" ? "#FFFFFF" : color.plum} />
            </View>
            <Text style={[type.bodyMedium, { color: selected === "Custom" ? "#FFFFFF" : color.bone }]}>
              Something else
            </Text>
          </Pressable>
        </View>

        {selected === "Custom" && (
          <TextInput
            style={styles.input}
            placeholder="Describe where you're going"
            placeholderTextColor={color.stone}
            value={customLabel}
            onChangeText={setCustomLabel}
          />
        )}

        {selected && (
          <TextInput
            style={[styles.input, { marginTop: space.sm }]}
            placeholder="Anything special I should know? (optional)"
            placeholderTextColor={color.stone}
            value={specialNote}
            onChangeText={setSpecialNote}
          />
        )}

        {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

        <Pressable disabled={!occasionLabel || loading} onPress={findOutfit} style={[!occasionLabel || loading ? { opacity: 0.4 } : null]}>
          <LinearGradient
            colors={occasionLabel ? [selectedAccent, color.gold] : [color.inkElevated, color.inkElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <Feather name="zap" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={[type.bodyMedium, { color: "#FFFFFF" }]}>
              {loading ? "Styling your look…" : "Find my outfit"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  scrollContent: { paddingTop: space.xxl, paddingBottom: space.xxl },
  heroWrap: { position: "relative", marginBottom: space.md },
  heroGlow: {
    position: "absolute",
    top: -space.xxl,
    left: -space.lg,
    right: -space.lg,
    height: 220,
    borderRadius: 999,
  },
  logo: { width: 96, height: 26, marginBottom: space.lg },
  greeting: { color: color.bone, marginBottom: space.xs, fontSize: 18, fontFamily: type.h2.fontFamily },
  namePrompt: { marginBottom: space.xs },
  namePromptLink: { color: color.gold, marginTop: 2 },
  heroTitle: { color: color.bone, marginBottom: space.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xxl },
  card: {
    paddingVertical: 16,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
    minWidth: "31%",
    alignItems: "center",
  },
  iconDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  input: {
    marginTop: space.lg,
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: color.bone,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  error: { color: color.gold, marginTop: space.md, fontFamily: type.caption.fontFamily },
  cta: {
    marginTop: space.xl,
    paddingVertical: 17,
    borderRadius: radius.pill,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
});
