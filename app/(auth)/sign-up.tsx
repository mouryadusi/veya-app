import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Image } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { color, space, type } from "@/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Stage = "email" | "password";

export default function SignUp() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function goToPasswordStage() {
    setErrorMsg(null);
    if (!EMAIL_RE.test(email.trim())) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    setStage("password");
  }

  async function handleSignUp() {
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").insert({ id: data.user.id, onboarding_completed: false });
    }
    setLoading(false);

    if (!data.session) {
      // Email confirmation required by the Supabase project's auth settings.
      setErrorMsg("Check your email to confirm your account, then sign in.");
      return;
    }
    router.replace("/onboarding");
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        {stage === "password" && (
          <Pressable onPress={() => setStage("email")} style={styles.back}>
            <Text style={{ color: color.stone }}>← Back</Text>
          </Pressable>
        )}

        {stage === "email" ? (
          <>
            <Image source={require("../../assets/brand/icon-monochrome.png")} style={styles.iconMark} resizeMode="contain" />
            <Text style={[type.hero, styles.title]}>Create your closet</Text>
            <Text style={[type.body, styles.subtitle]}>Takes two minutes. No shopping required.</Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={color.stone}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={goToPasswordStage}
                returnKeyType="next"
              />
              {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
              <Button label="Continue" onPress={goToPasswordStage} disabled={!email} />
            </View>
          </>
        ) : (
          <>
            <Text style={[type.hero, styles.title]}>Set a password</Text>
            <Text style={[type.body, styles.subtitle]}>{email}</Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Password (min. 8 characters)"
                placeholderTextColor={color.stone}
                secureTextEntry
                autoFocus
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSignUp}
                returnKeyType="done"
              />
              {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
              <Button label="Create account" onPress={handleSignUp} loading={loading} disabled={!password} />
            </View>
          </>
        )}

        <Link href="/(auth)/sign-in" style={styles.link}>
          <Text style={[type.body, { color: color.stone }]}>
            Already have an account? <Text style={{ color: color.bone }}>Sign in</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink, justifyContent: "center" },
  content: { paddingHorizontal: space.lg },
  back: { position: "absolute", top: -space.xxl, left: 0 },
  iconMark: { width: 40, height: 40, marginBottom: space.md },
  title: { color: color.bone, marginBottom: space.xs },
  subtitle: { color: color.stone, marginBottom: space.xxl },
  form: { gap: space.md },
  input: {
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
  error: { color: color.gold },
  link: { marginTop: space.xl, alignSelf: "center" },
});
