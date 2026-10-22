import { BOOK_AUTHOR_MAX_LENGTH, BOOK_SEARCH_MAX_LENGTH, BOOK_SEARCH_MIN_LENGTH, BOOK_TITLE_MAX_LENGTH, type BookSuggestion } from '@sapios/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { api } from '@/lib/api';
import { errorCode } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';
import { Button } from './Button';
import { Field } from './Field';
import { BookIcon, CheckIcon, PlusIcon } from './Icons';
import { Body, Small } from './Text';

type Status = 'idle' | 'loading' | 'empty' | 'unavailable' | 'busy';

const STATUS_TEXT: Record<Exclude<Status, 'idle'>, string> = {
  loading: 'Recherche dans le catalogue…',
  empty: 'Aucun résultat. Saisissez le titre et l’auteur à la main.',
  unavailable: 'Recherche indisponible pour l’instant. Saisissez le titre et l’auteur à la main.',
  busy: 'Beaucoup de recherches d’un coup. Patientez une minute, ou saisissez à la main.',
};

export type NewBook = { title: string; author: string; olWorkId: string | null };

/**
 * Ajouter un livre : recherche pendant la frappe dans le catalogue Open Library, relayée par le
 * serveur (le service ne voit jamais l'adresse du membre), ou saisie à la main. Titres seuls, sans
 * couverture (D4). `onAdd` rend vrai si le livre est enregistré : les champs se vident alors.
 */
export function BookSearch({ disabled, onAdd }: { disabled?: boolean; onAdd: (book: NewBook) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [picked, setPicked] = useState<BookSuggestion | null>(null);
  const [results, setResults] = useState<BookSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const seq = useRef(0);

  useEffect(() => {
    const q = title.trim();
    const mine = ++seq.current;
    if (picked || q.length < BOOK_SEARCH_MIN_LENGTH) {
      setResults([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    // Une recherche par pause de frappe ; une réponse arrivée après une frappe plus récente est ignorée.
    const timer = setTimeout(() => {
      api
        .searchBooks(q.slice(0, BOOK_SEARCH_MAX_LENGTH))
        .then((r) => {
          if (mine !== seq.current) return;
          setResults(r.results);
          setStatus(r.results.length ? 'idle' : 'empty');
        })
        .catch((e) => {
          if (mine !== seq.current) return;
          setResults([]);
          setStatus(errorCode(e) === 'rate_limited' ? 'busy' : 'unavailable');
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [title, picked]);

  const pick = (b: BookSuggestion) => {
    setPicked(b);
    setTitle(b.title);
    setAuthor(b.author ?? '');
    setResults([]);
  };

  const add = async () => {
    const ok = await onAdd({ title, author, olWorkId: picked?.ol_work_id ?? null });
    if (!ok) return;
    setTitle('');
    setAuthor('');
    setPicked(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Field
        testID="book-title"
        label="Ajouter un livre"
        placeholder="Titre ou auteur"
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          if (picked && v !== picked.title) setPicked(null);
        }}
        maxLength={BOOK_TITLE_MAX_LENGTH}
        autoCorrect={false}
      />
      {results.length ? (
        <View testID="book-results" accessibilityRole="list" accessibilityLabel="Livres trouvés" style={{ backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 4 }}>
          {results.map((b, i) => (
            <Pressable
              key={`${b.ol_work_id ?? b.title}-${i}`}
              testID={`book-result-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Choisir « ${b.title} »${b.author ? `, ${b.author}` : ''}`}
              onPress={() => pick(b)}
            >
              {({ pressed }) => (
                <View
                  style={{
                    minHeight: 52,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderTopWidth: i ? 1 : 0,
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.line : 'transparent',
                  }}
                >
                  <BookIcon size={16} color={colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Body weight="bold" size={15} numberOfLines={2}>
                      {b.title}
                    </Body>
                    {b.author ? <Small numberOfLines={1}>{b.author}</Small> : null}
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : status !== 'idle' ? (
        <Small testID="book-search-status" accessibilityLiveRegion="polite">
          {STATUS_TEXT[status]}
        </Small>
      ) : null}
      {picked ? (
        <View testID="book-picked" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={16} color={colors.accent} />
          <Small weight="semibold" color={colors.accent}>
            Trouvé dans le catalogue.
          </Small>
        </View>
      ) : null}
      <Field
        testID="book-author"
        placeholder="Auteur (facultatif)"
        accessibilityLabel="Auteur du livre"
        value={author}
        onChangeText={setAuthor}
        maxLength={BOOK_AUTHOR_MAX_LENGTH}
      />
      <Button testID="book-add" label="Ajouter à ma bibliothèque" variant="secondary" size="md" disabled={!title.trim() || disabled} icon={<PlusIcon size={18} />} onPress={add} />
      <Small size={12.5}>Recherche par Open Library, via nos serveurs : seul le texte cherché lui est transmis.</Small>
    </View>
  );
}
