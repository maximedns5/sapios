import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/TabBar';
import { useInbox } from '@/lib/inbox';
import { colors } from '@/lib/theme';

/** Espace candidat : offres, candidatures, messages, profil. */
export default function AppLayout() {
  const { unread, invitations } = useInbox();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} badges={{ messages: unread, applications: invitations }} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'bottom', sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="offers" />
      <Tabs.Screen name="applications" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
