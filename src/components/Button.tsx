import { Pressable, Text, StyleSheet, ActivityIndicator, GestureResponderEvent } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? color.ink : color.bone} />
      ) : (
        <Text
          style={[
            type.bodyMedium,
            { color: variant === "primary" ? color.ink : color.bone },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: color.bone },
  secondary: { backgroundColor: color.inkElevated, borderWidth: 1, borderColor: color.border },
  ghost: { backgroundColor: "transparent" },
});
