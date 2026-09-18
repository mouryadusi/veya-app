import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { color, space, type } from "@/theme/tokens";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSignIn() {
    setErrorMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Image
          source={require("../../assets/brand/wordmark-transparent.png")}
          style={styles.wordmark}
          resizeMode="contain"
        />
        <Text style={[type.body, styles.subtitle]}>Your wardrobe, understood.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={color.stone}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={color.stone}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
          <Button label="Sign in" onPress={handleSignIn} loading={loading} disabled={!email || !password} />
        </View>

        <Link href="/(auth)/sign-up" style={styles.link}>
          <Text style={[type.body, { color: color.stone }]}>
            New to Veya? <Text style={{ color: color.bone }}>Create an account</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink, justifyContent: "center" },
  content: { paddingHorizontal: space.lg },
  wordmark: { width: 160, height: 43, marginBottom: space.xs, alignSelf: "center" },
  subtitle: { color: color.stone, marginBottom: space.xxl, textAlign: "center" },
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
  error: { color: color.danger, fontFamily: type.caption.fontFamily },
  link: { marginTop: space.xl, alignSelf: "center" },
});
