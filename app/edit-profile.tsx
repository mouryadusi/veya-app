import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useAccessibility } from "@/lib/accessibility/context";
import { Button } from "@/components/Button";
import type { Profile } from "@/types/database";
import { radius, space, type as baseType } from "@/theme/tokens";

const STYLE_OPTIONS = ["minimalist", "classic", "streetwear", "traditional", "preppy", "elegant", "sporty", "vintage"];
const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
const GENDER_OPTIONS = ["Woman", "Man", "Non-binary", "Something else", "Prefer not to say"];

export default function EditProfile() {
  const { theme } = useAccessibility();
  const c = theme.color;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [genderCustom, setGenderCustom] = useState("");
  const [styles_, setStyles] = useState<string[]>([]);
  const [fit, setFit] = useState<string | null>(null);
  const [stylingNotes, setStylingNotes] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", userData.user.id).single();
      const profile = data as Profile | null;
      if (profile) {
        setName(profile.display_name ?? "");
        const isPreset = profile.gender_preference && GENDER_OPTIONS.includes(profile.gender_preference);
        if (profile.gender_preference && !isPreset) {
          setGender("Something else");
          setGenderCustom(profile.gender_preference);
        } else {
          setGender(profile.gender_preference);
        }
        setStyles(profile.style_tags ?? []);
        setFit(profile.preferred_fit ?? null);
        setStylingNotes(profile.styling_notes ?? "");
      }
      setLoading(false);
    })();
  }, []);

  function toggleStyle(tag: string) {
    setStyles((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function save() {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase
        .from("profiles")
        .update({
          display_name: name.trim() || null,
          gender_preference: gender === "Something else" ? genderCustom.trim() || null : gender,
          style_tags: styles_,
          preferred_fit: fit,
          styling_notes: stylingNotes.trim() || null,
        })
        .eq("id", userData.user.id);
    }
    setSaving(false);
    router.back();
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.ink, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={c.bone} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.ink }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.lg }}>
        <Text style={{ color: c.stone }}>← Back</Text>
      </Pressable>

      <Text style={[baseType.h1, { color: c.bone, fontSize: 26 * theme.fontScale }]}>Edit profile</Text>

      <Text style={[baseType.h2, { color: c.bone, marginTop: space.xl, marginBottom: space.sm }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={c.stone}
        style={[styles.input, { backgroundColor: c.inkElevated, borderColor: c.border, color: c.bone }]}
        autoCapitalize="words"
      />

      <Text style={[baseType.h2, { color: c.bone, marginTop: space.xl, marginBottom: space.sm }]}>Recommendation preference</Text>
      <View style={styles.chipWrap}>
        {GENDER_OPTIONS.map((g) => (
          <Pressable
            key={g}
            onPress={() => setGender(g)}
            style={[styles.chip, { borderColor: c.border, backgroundColor: c.inkElevated }, gender === g && { backgroundColor: c.bone, borderColor: c.bone }]}
          >
            <Text style={{ color: gender === g ? c.ink : c.bone }}>{g}</Text>
          </Pressable>
        ))}
      </View>
      {gender === "Something else" && (
        <TextInput
          value={genderCustom}
          onChangeText={setGenderCustom}
          placeholder="Tell us in your own words"
          placeholderTextColor={c.stone}
          style={[styles.input, { backgroundColor: c.inkElevated, borderColor: c.border, color: c.bone, marginTop: space.sm }]}
        />
      )}

      <Text style={[baseType.h2, { color: c.bone, marginTop: space.xl, marginBottom: space.sm }]}>Style</Text>
      <View style={styles.chipWrap}>
        {STYLE_OPTIONS.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => toggleStyle(tag)}
            style={[styles.chip, { borderColor: c.border, backgroundColor: c.inkElevated }, styles_.includes(tag) && { backgroundColor: c.bone, borderColor: c.bone }]}
          >
            <Text style={{ color: styles_.includes(tag) ? c.ink : c.bone }}>{tag}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[baseType.h2, { color: c.bone, marginTop: space.xl, marginBottom: space.sm }]}>Preferred fit</Text>
      <View style={styles.chipWrap}>
        {FIT_OPTIONS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFit(f)}
            style={[styles.chip, { borderColor: c.border, backgroundColor: c.inkElevated }, fit === f && { backgroundColor: c.bone, borderColor: c.bone }]}
          >
            <Text style={{ color: fit === f ? c.ink : c.bone }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[baseType.h2, { color: c.bone, marginTop: space.xl, marginBottom: space.sm }]}>Styling notes</Text>
      <Text style={[baseType.caption, { color: c.stone, marginBottom: space.sm }]}>
        Anything you'd want a stylist to know — fit, coverage, proportions, whatever matters to you. Your own words,
        quoted back to you exactly when Veya reasons about an outfit.
      </Text>
      <TextInput
        value={stylingNotes}
        onChangeText={setStylingNotes}
        placeholder="e.g. I prefer higher necklines, or I like structure on top with something relaxed below"
        placeholderTextColor={c.stone}
        style={[styles.input, styles.notesInput, { backgroundColor: c.inkElevated, borderColor: c.border, color: c.bone }]}
        multiline
        numberOfLines={3}
      />

      <View style={{ marginTop: space.xxl, marginBottom: space.xl }}>
        <Button label="Save changes" onPress={save} loading={saving} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xxl },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 14, fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
});
