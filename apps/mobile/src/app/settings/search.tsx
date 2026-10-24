import type { ContractType, ExperienceBand } from '@sapios/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { AvailabilityField, CityField, ContractsField, ExperienceField, RadiusField, RemoteField, SalaryField, type City } from '@/components/SearchFields';
import { Heading, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';

/** Ma recherche : poste, zone, contrats, salaire, rythme, expérience (mêmes réglages qu'à l'inscription). */
export default function SearchSettings() {
  const { refresh } = useApp();
  const { toast } = useOverlay();
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState('');
  const [city, setCity] = useState<City | null>(null);
  const [radius, setRadius] = useState(20);
  const [contracts, setContracts] = useState<ContractType[]>(['cdi']);
  const [salary, setSalary] = useState<[number, number]>([38, 46]);
  const [remote, setRemote] = useState(0);
  const [available, setAvailable] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceBand | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    emploi
      .myCv()
      .then(({ profile: p }) => {
        if (!p) return;
        setRole(p.target_role);
        setCity({ city: p.search_city, postcode: p.search_postcode, lat: p.search_lat, lng: p.search_lng });
        setRadius(p.search_radius_km);
        setContracts(p.contract_types);
        setSalary([p.salary_min_k, p.salary_max_k]);
        setRemote(p.remote_days_min);
        setAvailable(p.available_from);
        setExperience(p.experience_band);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoaded(true));
  }, []);

  const valid = role.trim().length >= 2 && !!city && contracts.length > 0 && !!experience;

  const save = async () => {
    if (!valid || !city || !experience) return;
    setError(null);
    try {
      await emploi.saveProfile({
        target_role: role.trim().slice(0, 80),
        search_city: city.city,
        search_postcode: city.postcode,
        search_lat: city.lat,
        search_lng: city.lng,
        search_radius_km: radius,
        contract_types: contracts,
        salary_min_k: salary[0],
        salary_max_k: salary[1],
        remote_days_min: remote,
        available_from: available,
        experience_band: experience,
      });
      await refresh();
      toast('Recherche enregistrée. Les offres suivent.');
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      testID="search-settings"
      header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />}
      footer={<Button testID="search-save" label="Enregistrer" disabled={!valid} onPress={save} />}
    >
      <View style={{ gap: 22, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Ma recherche</Title>
        </MaskUp>
        {!loaded ? (
          <Spinner />
        ) : (
          <Rise style={{ gap: 26 }}>
            <Field testID="search-role" label="Poste visé" value={role} onChangeText={setRole} maxLength={80} />
            <View style={{ gap: 14 }}>
              <CityField value={city} onChange={setCity} label="Centre de ma zone" />
              <RadiusField value={radius} onChange={setRadius} />
            </View>
            <View style={{ gap: 10 }}>
              <Heading size={17}>Contrats</Heading>
              <ContractsField value={contracts} onChange={setContracts} />
            </View>
            <View style={{ gap: 10 }}>
              <Heading size={17}>Salaire souhaité</Heading>
              <SalaryField min={salary[0]} max={salary[1]} onChange={(a, b) => setSalary([a, b])} />
            </View>
            <RemoteField value={remote} onChange={setRemote} />
            <View style={{ gap: 10 }}>
              <Heading size={17}>Disponible</Heading>
              <AvailabilityField value={available} onChange={setAvailable} />
            </View>
            <View style={{ gap: 10 }}>
              <Heading size={17}>Expérience</Heading>
              <ExperienceField value={experience} onChange={setExperience} />
            </View>
            {error ? <Notice kind="error" message={error} /> : null}
          </Rise>
        )}
      </View>
    </Screen>
  );
}
