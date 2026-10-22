import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/TabBar';
import { useInbox } from '@/lib/inbox';
import { colors } from '@/lib/theme';

/** Espace membre : découverte, likes, messages, profil. */
export default function AppLayout() {
  const { unread, fresh } = useInbox();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} badges={{ messages: unread }} marks={{ messages: fresh > 0 }} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'bottom', sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
