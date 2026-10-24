import { CONTRACT_LABELS, CONTRACT_TYPES, EMPLOI_LIMITS, EXPERIENCE_BAND_LABELS, EXPERIENCE_BANDS, type ContractType, type ExperienceBand, type GeoResult } from '@sapios/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { alpha, colors, radius } from '@/lib/theme';
import { Chip, ChipRow, OptionCard, Segmented, ValueSlider } from './Controls';
import { Field } from './Field';
import { CheckIcon, PinIcon } from './Icons';
import { Spinner } from './motion';
import { Body, Label, Small } from './Text';

export type City = { city: string; postcode: string | null; lat: number; lng: number };

/**
 * Ville de recherche : saisie, suggestions de la Géoplateforme (relayées par le serveur), choix. Seul le centre
 * de la ville est gardé ; l'adresse du candidat n'est jamais demandée.
 */
export function CityField({ value, onChange, label = 'Ville', testID = 'city' }: { value: City | null; onChange: (c: City | null) => void; label?: string; testID?: string }) {
  const [q, setQ] = useState(value?.city ?? '');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (value && text === value.city) {
      setResults([]);
      return;
    }
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await emploi.geocode(text, 'city');
        if (id === seq.current) {
          setResults(list);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, value]);

  return (
    <View style={{ gap: 8 }}>
      <Field
        testID={testID}
        label={label}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          if (value) onChange(null);
        }}
        placeholder="Paris, Lyon, Nantes…"
        autoCorrect={false}
        autoComplete="off"
        error={error}
        accessibilityHint="Choisissez ensuite une ville dans la liste"
      />
      {loading ? <Spinner size={20} /> : null}
      {results.length ? (
        <View role="list" accessibilityLabel="Villes proposées" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.field, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <Pressable
              key={`${r.label}-${i}`}
              testID={`${testID}-option-${i}`}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              onPress={() => {
                onChange({ city: r.city, postcode: r.postcode, lat: r.lat, lng: r.lng });
                setQ(r.city);
                setResults([]);
              }}
            >
              {({ pressed }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48, borderTopWidth: i ? 1 : 0, borderColor: colors.line, backgroundColor: pressed ? colors.surface : colors.bg }}>
                  <PinIcon size={16} color={colors.muted} />
                  <Body size={15}>{r.label}</Body>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={15} stroke={3} color={colors.accent} />
          <Small weight="semibold" color={colors.accent}>
            {value.city}
            {value.postcode ? ` (${value.postcode})` : ''}
          </Small>
        </View>
      ) : null}
    </View>
  );
}

export function RadiusField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>Rayon de recherche</Label>
        <Body weight="bold" size={15}>
          {value} km
        </Body>
      </View>
      <ValueSlider testID="radius" label="Rayon de recherche" min={EMPLOI_LIMITS.radiusMinKm} max={EMPLOI_LIMITS.radiusMaxKm} step={5} value={value} onChange={onChange} format={(v) => `${v} km`} />
    </View>
  );
}

export function ContractsField({ value, onChange }: { value: ContractType[]; onChange: (v: ContractType[]) => void }) {
  const toggle = (c: ContractType) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <View style={{ gap: 10 }}>
      {CONTRACT_TYPES.map((c) => (
        <OptionCard key={c} testID={`contract-${c}`} multiple label={CONTRACT_LABELS[c]} hint={c === 'cdi' ? 'Contrat à durée indéterminée' : 'Contrat à durée déterminée'} active={value.includes(c)} onPress={() => toggle(c)} />
      ))}
      <Small>Stages, alternances et missions d’intérim ne sont pas proposés pendant le pilote.</Small>
    </View>
  );
}

const SALARY_STEPS = Array.from({ length: (120 - 20) / 2 + 1 }, (_, i) => 20 + i * 2);

/** Fourchette souhaitée, en k€ brut annuel. Jamais le salaire actuel. */
export function SalaryField({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: alpha(colors.accent, 0.08), borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Body weight="extrabold" size={22} color={colors.accent} accessibilityLiveRegion="polite">
          {min}–{max} k€ brut/an
        </Body>
      </View>
      <ValueSlider testID="salary-min" label="Minimum souhaité" min={SALARY_STEPS[0]} max={SALARY_STEPS[SALARY_STEPS.length - 1]} step={2} value={min} onChange={(v) => onChange(v, Math.max(v, max))} format={(v) => `minimum ${v} k€`} />
      <ValueSlider testID="salary-max" label="Maximum souhaité" min={SALARY_STEPS[0]} max={SALARY_STEPS[SALARY_STEPS.length - 1]} step={2} value={max} onChange={(v) => onChange(Math.min(min, v), v)} format={(v) => `maximum ${v} k€`} />
      <Small>En brut annuel. On ne vous demandera jamais votre salaire actuel.</Small>
    </View>
  );
}

export function RemoteField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [
    { value: '0', label: 'Indifférent' },
    { value: '1', label: '1 j' },
    { value: '2', label: '2 j' },
    { value: '3', label: '3 j et +' },
  ];
  return (
    <View style={{ gap: 10 }}>
      <Label>Télétravail souhaité par semaine</Label>
      <Segmented testID="remote" label="Télétravail souhaité" options={options} value={String(Math.min(3, value))} onChange={(v) => onChange(Number(v))} />
    </View>
  );
}

function nextMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return { value, label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
  });
}

/** Disponibilité : immédiatement ou à partir d'un mois (les six prochains). */
export function AvailabilityField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const months = nextMonths(6);
  return (
    <ChipRow>
      <Chip testID="available-now" radio label="Immédiatement" active={value == null} onPress={() => onChange(null)} />
      {months.map((m) => (
        <Chip key={m.value} radio label={m.label} active={value?.slice(0, 7) === m.value.slice(0, 7)} onPress={() => onChange(m.value)} />
      ))}
    </ChipRow>
  );
}

export function ExperienceField({ value, onChange }: { value: ExperienceBand | null; onChange: (v: ExperienceBand) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {EXPERIENCE_BANDS.map((b) => (
        <OptionCard key={b} testID={`experience-${b}`} label={EXPERIENCE_BAND_LABELS[b]} hint={b === 'y0_1' ? 'Alternance et stages compris' : undefined} active={value === b} onPress={() => onChange(b)} />
      ))}
    </View>
  );
}
