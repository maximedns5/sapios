import { Tabs } from 'expo-router/tabs';
import { useCallback, useEffect, useState } from 'react';

import { TabBar } from '@/components/TabBar';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { channelName, supabase } from '@/lib/supabase';
import { PAPER } from '@/lib/theme';

/** Espace membre : découverte, likes (accès illimité), messages, compte. */
export default function AppLayout() {
  const { state, userId } = useApp();
  const [unread, setUnread] = useState(0);

  const countUnread = useCallback(async () => {
    try {
      const rows = await api.matches();
      setUnread(rows.reduce((n, r) => n + (r.unread_count ?? 0), 0));
    } catch {
      // badge facultatif
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    countUnread();
    // Nouveau message ou nouveau match : le badge « Messages » se met à jour (la RLS filtre les lignes).
    const channel = supabase
      .channel(channelName(`badge:${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => countUnread())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => countUnread())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [countUnread, userId]);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} badges={{ messages: unread }} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: PAPER } }}
    >
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="likes" options={{ href: state?.sees_likers ? undefined : null }} />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
