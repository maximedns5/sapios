import type { CompanyHit } from '@sapios/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { Switch } from '@/components/Controls';
import { Field } from '@/components/Field';
import { CrossIcon, PlusIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';

function CompanyRow({ company, action }: { company: CompanyHit; action: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 18, paddingLeft: 12, paddingRight: 6, minHeight: 60 }}>
      <CompanyLogo name={company.display_name} size={38} />
      <View style={{ flex: 1 }}>
        <Body weight="bold" size={15}>
          {company.display_name}
        </Body>
        {company.city ? <Small size={13}>{company.city}</Small> : null}
      </View>
      {action}
    </View>
  );
}

/**
 * Visibilité : « Ouvert·e aux opportunités » (désactivé par défaut, consentement révocable) et les entreprises
 * à qui masquer son profil (l'employeur actuel, par exemple).
 */
export default function Visibility() {
  const { state, refresh } = useApp();
  const { toast } = useOverlay();
  const [blocks, setBlocks] = useState<CompanyHit[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const open = !!state?.candidate?.open_to_opportunities;

  const loadBlocks = useCallback(() => emploi.blocks().then(setBlocks).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(() => {
      emploi
        .searchCompanies(text)
        .then((list) => id === seq.current && setHits(list))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const toggleOpen = async (value: boolean) => {
    try {
      await emploi.saveProfile({ open_to_opportunities: value });
      await refresh();
      toast(value ? 'Les recruteurs peuvent maintenant vous inviter à postuler.' : 'Vous n’apparaissez plus dans l’approche directe.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const block = async (c: CompanyHit) => {
    try {
      await emploi.blockCompany(c.id);
      setQ('');
      setHits([]);
      await loadBlocks();
      toast(`Profil masqué à ${c.display_name}.`);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const unblock = async (c: CompanyHit) => {
    try {
      await emploi.unblockCompany(c.id);
      await loadBlocks();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const blockedIds = new Set(blocks.map((b) => b.id));

  return (
    <Screen scroll testID="visibility" header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />}>
      <View style={{ gap: 22, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Visibilité</Title>
        </MaskUp>

        <Rise delay={60} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Body weight="bold" size={16}>
                Ouvert·e aux opportunités
              </Body>
              <Small>Les recruteurs des entreprises vérifiées peuvent voir votre CV anonyme et vous inviter à postuler à une offre précise.</Small>
            </View>
            <Switch testID="open-switch" label="Ouvert·e aux opportunités" value={open} onChange={toggleOpen} />
          </View>
          <Small size={13}>Désactivé par défaut. Une invitation ne révèle jamais votre nom : vous décidez ensuite de postuler, ou non.</Small>
        </Rise>

        <View style={{ gap: 12 }}>
          <Heading size={18}>Entreprises masquées</Heading>
          <Small>Elles ne vous verront jamais dans l’approche directe et ne pourront pas vous inviter. Pratique pour votre employeur actuel.</Small>
          {blocks.map((c) => (
            <CompanyRow
              key={c.id}
              company={c}
              action={
                <IconButton label={`Ne plus masquer à ${c.display_name}`} variant="plain" size={40} onPress={() => unblock(c)}>
                  <CrossIcon size={16} />
                </IconButton>
              }
            />
          ))}
          <Field testID="company-search" label="Masquer à une entreprise" value={q} onChangeText={setQ} placeholder="Nom de l’entreprise" autoCorrect={false} />
          {hits
            .filter((h) => !blockedIds.has(h.id))
            .map((c) => (
              <CompanyRow
                key={c.id}
                company={c}
                action={
                  <IconButton label={`Masquer mon profil à ${c.display_name}`} variant="plain" size={40} onPress={() => block(c)}>
                    <PlusIcon size={18} color={colors.accent} />
                  </IconButton>
                }
              />
            ))}
          {q.trim().length >= 2 && hits.length === 0 ? <Small>Aucune entreprise vérifiée à ce nom pour l’instant.</Small> : null}
          {error ? <Notice kind="error" message={error} /> : null}
        </View>
      </View>
    </Screen>
  );
}
