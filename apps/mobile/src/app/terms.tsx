import { View } from 'react-native';

import { useAccountDeletion } from '@/components/AccountDeletion';
import { TextLink } from '@/components/Button';
import { Header, Screen } from '@/components/Screen';
import { TermsForm } from '@/components/TermsForm';
import { useApp } from '@/lib/app-state';
import { colors } from '@/lib/theme';

/**
 * Écran bloquant : les CGU ont changé depuis la dernière acceptation. Accepter, ou supprimer son compte ;
 * rien d'autre n'est accessible tant que la nouvelle version n'est pas acceptée.
 */
export default function TermsUpdate() {
  const { state, refresh, signOut } = useApp();
  const deleteAccount = useAccountDeletion();
  const version = state?.terms.required_version;
  if (!version) return null;
  return (
    <Screen scroll testID="terms-update-screen" header={<Header right={<TextLink label="Se déconnecter" color={colors.muted} size={14} onPress={() => signOut()} />} />}>
      <View style={{ paddingTop: 8 }}>
        <TermsForm version={version} mode="update" onDone={refresh} onDelete={deleteAccount} />
      </View>
    </Screen>
  );
}
