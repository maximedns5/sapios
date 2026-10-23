import { View } from 'react-native';

import { useAccountDeletion } from '@/components/AccountDeletion';
import { Header, Screen } from '@/components/Screen';
import { TermsForm } from '@/components/TermsForm';
import { TextLink } from '@/components/Button';
import { useApp } from '@/lib/app-state';
import { colors } from '@/lib/theme';

/**
 * Écran bloquant : les CGU ont changé depuis la dernière acceptation (CGU art. 14.1). Accepter, ou
 * supprimer son compte ; rien d'autre n'est accessible tant que la nouvelle version n'est pas acceptée.
 */
export default function TermsUpdate() {
  const { state, refresh, signOut } = useApp();
  const deleteAccount = useAccountDeletion();
  if (!state?.terms) return null;
  return (
    <Screen scroll testID="terms-update-screen" header={<Header right={<TextLink label="Se déconnecter" color={colors.muted} size={14} onPress={() => signOut()} />} />}>
      <View style={{ paddingTop: 8 }}>
        <TermsForm terms={state.terms} mode="update" onDone={refresh} onDelete={deleteAccount} />
      </View>
    </Screen>
  );
}
