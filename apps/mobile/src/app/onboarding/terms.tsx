import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { TermsForm } from '@/components/TermsForm';
import { useApp } from '@/lib/app-state';

/** Avant l'inscription : acceptation des CGU candidats de la version en vigueur. */
export default function TermsStep() {
  const { state, refresh } = useApp();
  const version = state?.terms.required_version;
  if (!version) return null;
  return (
    <Screen scroll header={<StepHeader step={1} />} testID="onboarding-terms">
      <View style={{ paddingTop: 20 }}>
        <TermsForm version={version} mode="first" onDone={refresh} />
      </View>
    </Screen>
  );
}
