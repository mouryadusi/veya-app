import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useAccessibility } from "@/lib/accessibility/context";
import type { Profile } from "@/types/database";
import { radius, space, type as baseType } from "@/theme/tokens";

const PRESENTATION_URL = "https://veya-5dfqx40.public.builtwithrocket.new/";

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const { theme, activeProfileIds } = useAccessibility();
  const c = theme.color;

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    setEmail(userData.user?.email ?? null);
    if (userData.user) {
      const { data } = await supabase.from("profiles").select("*").eq("id", userData.user.id).single();
      setProfile(data as Profile);
    }
  }

  // Root-cause fix, not a rendering patch: this is a TAB screen, which Expo
  // Router keeps mounted rather than remounting when you navigate away and
  // back. A plain useEffect([]) only ever ran once, at first mount, before
  // any edited name existed — so returning here after Edit Profile silently
  // showed stale data forever. useFocusEffect re-runs every time this tab
  // is actually shown, matching the pattern already correct elsewhere in
  // this codebase (wardrobe.tsx, history.tsx, insights.tsx).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.ink }]} contentContainerStyle={styles.content}>
      <Text style={[baseType.h1, { color: c.bone, fontSize: 26 * theme.fontScale }]}>
        {profile?.display_name || "Profile"}
      </Text>
      <Text style={[baseType.body, { color: c.stone, marginTop: space.xs, fontSize: 15 * theme.fontScale }]}>{email}</Text>

      {profile && (
        <View style={[styles.section, { backgroundColor: c.inkElevated, borderColor: c.border, borderWidth: 1 }]}>
          {profile.gender_preference && (
            <>
              <Text style={[baseType.mono, { color: c.stone }]}>PREFERENCE</Text>
              <Text style={[baseType.body, { color: c.bone, marginTop: space.xs, marginBottom: space.lg, fontSize: 15 * theme.fontScale }]}>
                {profile.gender_preference}
              </Text>
            </>
          )}

          <Text style={[baseType.mono, { color: c.stone }]}>STYLE</Text>
          <Text style={[baseType.body, { color: c.bone, marginTop: space.xs, fontSize: 15 * theme.fontScale }]}>
            {profile.style_tags?.length ? profile.style_tags.join(", ") : "Not set yet"}
          </Text>

          <Text style={[baseType.mono, { color: c.stone, marginTop: space.lg }]}>PREFERRED FIT</Text>
          <Text style={[baseType.body, { color: c.bone, marginTop: space.xs, fontSize: 15 * theme.fontScale }]}>
            {profile.preferred_fit ?? "Not set yet"}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => router.push("/edit-profile")}
        style={[styles.linkRow, { borderColor: c.border, minHeight: theme.minTouchTarget }]}
      >
        <Text style={[baseType.bodyMedium, { color: c.bone, fontSize: 15 * theme.fontScale }]}>Edit profile & preferences</Text>
        <Text style={{ color: c.stone }}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/accessibility")}
        style={[styles.linkRow, { borderColor: c.border, minHeight: theme.minTouchTarget }]}
      >
        <Text style={[baseType.bodyMedium, { color: c.bone, fontSize: 15 * theme.fontScale }]}>Accessibility</Text>
        <Text style={{ color: c.stone }}>
          {activeProfileIds.length > 0 ? `${activeProfileIds.length} active ›` : "›"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL(PRESENTATION_URL)}
        style={[styles.linkRow, { borderColor: c.border, minHeight: theme.minTouchTarget }]}
      >
        <Text style={[baseType.bodyMedium, { color: c.bone, fontSize: 15 * theme.fontScale }]}>About Veya</Text>
        <Text style={{ color: c.stone }}>↗</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/delete-account")}
        style={[styles.linkRow, { borderColor: c.border, minHeight: theme.minTouchTarget, marginTop: space.xl }]}
      >
        <Text style={[baseType.bodyMedium, { color: c.danger, fontSize: 15 * theme.fontScale }]}>Delete my data</Text>
        <Text style={{ color: c.stone }}>›</Text>
      </Pressable>

      <Pressable
        style={styles.signOut}
        onPress={() => {
          supabase.auth.signOut().catch((err) => {
            console.error("Sign out failed:", err instanceof Error ? err.message : err);
          });
        }}
      >
        <Text style={[baseType.bodyMedium, { color: c.danger }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xxl },
  section: { marginTop: space.xl, padding: space.md, borderRadius: radius.md },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.md,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  signOut: { marginTop: space.xxl, alignItems: "center" },
});
