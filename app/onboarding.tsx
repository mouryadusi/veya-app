import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { color, radius, space, type } from "@/theme/tokens";

const STYLE_OPTIONS = [
  "minimalist", "classic", "streetwear", "traditional",
  "preppy", "elegant", "sporty", "vintage",
];
const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
const GENDER_OPTIONS = ["Woman", "Man", "Non-binary", "Something else", "Prefer not to say"];

export default function Onboarding() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [genderCustom, setGenderCustom] = useState("");
  const [styles_, setStyles] = useState<string[]>([]);
  const [fit, setFit] = useState<(typeof FIT_OPTIONS)[number] | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleStyle(tag: string) {
    setStyles((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function finish() {
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
          onboarding_completed: true,
        })
        .eq("id", userData.user.id);
    }
    setSaving(false);
    router.replace("/(tabs)");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Image source={require("../assets/brand/icon-monochrome.png")} style={styles.iconMark} resizeMode="contain" />
      <Text style={[type.h1, { color: color.bone }]}>What should we call you?</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={color.stone}
        style={styles.nameInput}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <Text style={[type.h1, { color: color.bone, marginTop: space.xl }]}>How should Veya tailor recommendations?</Text>
      <Text style={[type.body, { color: color.stone, marginBottom: space.md }]}>
        Optional — helps with fit and silhouette suggestions. Change anytime in Profile.
      </Text>
      <View style={styles.chipWrap}>
        {GENDER_OPTIONS.map((g) => (
          <Pressable key={g} onPress={() => setGender(g)} style={[styles.chip, gender === g && styles.chipActive]}>
            <Text style={[type.body, { color: gender === g ? color.ink : color.bone }]}>{g}</Text>
          </Pressable>
        ))}
      </View>
      {gender === "Something else" && (
        <TextInput
          value={genderCustom}
          onChangeText={setGenderCustom}
          placeholder="Tell us in your own words"
          placeholderTextColor={color.stone}
          style={[styles.nameInput, { marginTop: space.sm }]}
        />
      )}

      <Text style={[type.h1, { color: color.bone, marginTop: space.xl }]}>What's your style?</Text>
      <Text style={[type.body, { color: color.stone, marginBottom: space.lg }]}>
        Pick as many as fit. You can change these anytime.
      </Text>

      <View style={styles.chipWrap}>
        {STYLE_OPTIONS.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => toggleStyle(tag)}
            style={[styles.chip, styles_.includes(tag) && styles.chipActive]}
          >
            <Text style={[type.body, { color: styles_.includes(tag) ? color.ink : color.bone }]}>{tag}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[type.h2, { color: color.bone, marginTop: space.xl, marginBottom: space.sm }]}>
        Preferred fit
      </Text>
      <View style={styles.chipWrap}>
        {FIT_OPTIONS.map((f) => (
          <Pressable key={f} onPress={() => setFit(f)} style={[styles.chip, fit === f && styles.chipActive]}>
            <Text style={[type.body, { color: fit === f ? color.ink : color.bone }]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: space.xxl }}>
        <Button label="Continue to my wardrobe" onPress={finish} loading={saving} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, paddingTop: space.xxl },
  iconMark: { width: 32, height: 32, marginBottom: space.lg },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.inkElevated,
  },
  chipActive: { backgroundColor: color.bone, borderColor: color.bone },
  nameInput: {
    backgroundColor: color.inkElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: color.bone,
    fontSize: 16,
    marginTop: space.sm,
  },
});
