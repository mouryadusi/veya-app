import { useEffect, useState, useCallback, useRef } from "react";
import { View, Animated } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, Fraunces_600SemiBold, Fraunces_500Medium_Italic } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { color } from "@/theme/tokens";
import { AccessibilityProvider, useAccessibility } from "@/lib/accessibility/context";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutInner() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_500Medium,
  });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const { loaded: a11yLoaded, theme } = useAccessibility();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((err) => {
        // This runs on every single app launch before anything else — an
        // unguarded rejection here (corrupted SecureStore data, a network
        // blip during token refresh) was a strong candidate for the
        // reported "Possible Unhandled Promise Rejection". Treat failure
        // as signed-out rather than leaving `session` stuck at `undefined`
        // forever, which would hang the app on the splash screen.
        console.error("getSession failed on launch:", err instanceof Error ? err.message : err);
        setSession(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const ready = fontsLoaded && session !== undefined && a11yLoaded;

  const onLayout = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [ready, session, segments]);

  // Animated launch logo: a brief in-JS intro shown right after the native
  // (static) splash hides. It's a pure overlay on top of <Slot /> — routing
  // resolves normally underneath regardless of whether this is playing, so
  // it can't introduce a race with the auth-redirect effect above. Reduced
  // motion skips it entirely rather than showing a static hold, per the
  // same accessibility principle already applied to the outfit reveal
  // animation elsewhere in the app.
  const [showIntro, setShowIntro] = useState(true);
  const introScale = useRef(new Animated.Value(0.85)).current;
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introFadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready) return;
    if (!theme.motionEnabled) {
      setShowIntro(false);
      return;
    }
    Animated.sequence([
      Animated.parallel([
        Animated.spring(introScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        Animated.timing(introOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      Animated.delay(450),
      Animated.timing(introFadeOut, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => setShowIntro(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ink }} onLayout={onLayout}>
      <StatusBar style="dark" />
      {theme.brightnessOverlayOpacity > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#000",
            opacity: theme.brightnessOverlayOpacity,
            zIndex: 999,
          }}
        />
      )}
      <Slot />

      {showIntro && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.color.ink,
            alignItems: "center",
            justifyContent: "center",
            opacity: introFadeOut,
            zIndex: 1000,
          }}
        >
          <Animated.Image
            source={require("../assets/brand/wordmark-transparent.png")}
            resizeMode="contain"
            style={{
              width: 180,
              height: 48,
              opacity: introOpacity,
              transform: [{ scale: introScale }],
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AccessibilityProvider>
      <RootLayoutInner />
    </AccessibilityProvider>
  );
}
