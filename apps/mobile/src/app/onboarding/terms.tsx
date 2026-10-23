import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { TermsForm } from '@/components/TermsForm';
import { useApp } from '@/lib/app-state';

/** Avant l'inscription : acceptation des CGU de la version en vigueur (CGU art. 1.2). */
export default function TermsStep() {
  const { state, refresh } = useApp();
  if (!state?.terms) return null;
  return (
    <Screen scroll header={<StepHeader step={1} />} testID="onboarding-terms">
      <View style={{ paddingTop: 20 }}>
        <TermsForm terms={state.terms} mode="first" onDone={refresh} />
      </View>
    </Screen>
  );
}
