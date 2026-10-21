import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/TabBar';
import { useApp } from '@/lib/app-state';
import { useInbox } from '@/lib/inbox';
import { useLayout } from '@/lib/layout';
import { PAPER } from '@/lib/theme';

/** Espace membre : découverte, likes (accès illimité), messages, compte. */
export default function AppLayout() {
  const { state } = useApp();
  const { unread, fresh } = useInbox();
  const { wide } = useLayout();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} badges={{ messages: unread }} marks={{ messages: fresh > 0 }} />}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', sceneStyle: { backgroundColor: PAPER } }}
    >
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="likes" options={{ href: state?.sees_likers ? undefined : null }} />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
