import { Tabs } from "expo-router";
import { Text } from "react-native";
import { color } from "@/theme/tokens";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 12, color: focused ? color.bone : color.stone }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: color.ink, borderTopColor: color.border },
        tabBarShowLabel: true,
        tabBarActiveTintColor: color.bone,
        tabBarInactiveTintColor: color.stone,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="wardrobe" options={{ title: "Wardrobe" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
