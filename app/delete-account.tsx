import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { deleteAccount } from "@/lib/ai/recommend";
import { useAccessibility } from "@/lib/accessibility/context";
import { radius, space, type as baseType } from "@/theme/tokens";

export default function DeleteAccountScreen() {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { theme } = useAccessibility();
  const c = theme.color;

  async function handleDelete() {
    setErrorMsg(null);
    setLoading(true);
    try {
      await deleteAccount();
      // The account no longer exists — sign out client-side to clear the
      // now-invalid local session, then return to the sign-in screen.
      await supabase.auth.signOut();
      router.replace("/(auth)/sign-in");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Couldn't delete your account right now. Try again in a moment.");
      setLoading(false);
    }
  }

  const canDelete = confirmText.trim() === "DELETE";

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.ink }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: space.lg }}>
        <Text style={{ color: c.stone }}>← Back</Text>
      </Pressable>

      <Text style={[baseType.h1, { color: c.danger, fontSize: 26 * theme.fontScale }]}>Delete my data</Text>
      <Text style={[baseType.body, { color: c.bone, marginTop: space.md, fontSize: 15 * theme.fontScale, lineHeight: 22 }]}>
        This permanently deletes your account and everything tied to it:
      </Text>

      <View style={styles.list}>
        <Text style={[baseType.body, { color: c.stone }]}>• Your profile and style preferences</Text>
        <Text style={[baseType.body, { color: c.stone }]}>• Every wardrobe photo you've uploaded</Text>
        <Text style={[baseType.body, { color: c.stone }]}>• Your entire wardrobe item catalog</Text>
        <Text style={[baseType.body, { color: c.stone }]}>• Every outfit recommendation and its history</Text>
        <Text style={[baseType.body, { color: c.stone }]}>• All Love/Try Again/Wear feedback</Text>
      </View>

      <Text style={[baseType.body, { color: c.danger, marginTop: space.lg, fontSize: 15 * theme.fontScale }]}>
        This cannot be undone. There is no recovery period.
      </Text>

      <Text style={[baseType.caption, { color: c.stone, marginTop: space.xl }]}>
        Type DELETE to confirm
      </Text>
      <TextInput
        value={confirmText}
        onChangeText={setConfirmText}
        placeholder="DELETE"
        placeholderTextColor={c.stone}
        style={[styles.input, { borderColor: c.border, color: c.bone }]}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {errorMsg && <Text style={[baseType.caption, { color: c.danger, marginTop: space.sm }]}>{errorMsg}</Text>}

      <Pressable
        onPress={handleDelete}
        disabled={!canDelete || loading}
        style={[
          styles.deleteBtn,
          { backgroundColor: canDelete ? c.danger : c.inkElevated, borderColor: c.border, borderWidth: canDelete ? 0 : 1 },
        ]}
      >
        {loading ? <ActivityIndicator color={c.bone} /> : <Text style={[baseType.bodyMedium, { color: canDelete ? "#FFFFFF" : c.stone }]}>Permanently delete my account</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xxl, paddingBottom: space.xxl },
  list: { marginTop: space.md, gap: 4 },
  input: {
    marginTop: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 16,
    letterSpacing: 2,
  },
  deleteBtn: { marginTop: space.xl, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center" },
});
