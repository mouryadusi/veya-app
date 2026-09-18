import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "@/types/database";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined);
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your Supabase project values."
  );
}

// SecureStore has a ~2KB per-key limit, so we chunk large values (Supabase
// session objects can exceed this once refresh tokens are included).
const CHUNK_SIZE = 1800;

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!chunkCountRaw) {
      // fall back to AsyncStorage for non-sensitive cached values
      return AsyncStorage.getItem(key);
    }
    const chunkCount = parseInt(chunkCountRaw, 10);
    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const part = await SecureStore.getItemAsync(`${key}_${i}`);
      if (part) parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks));
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(
        `${key}_${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
  },
  async removeItem(key: string): Promise<void> {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
    if (chunkCountRaw) {
      const chunkCount = parseInt(chunkCountRaw, 10);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`);
    }
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
