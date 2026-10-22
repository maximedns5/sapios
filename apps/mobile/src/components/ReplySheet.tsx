import { LIKE_COMMENT_MAX_LENGTH } from '@sapios/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';
import { Button } from './Button';
import { Field } from './Field';
import { HeartIcon } from './Icons';
import { Backdrop, SheetFrame } from './Overlay';
import { Photo, useSignedUrls } from './Photo';
import type { LikeTarget } from './ProfileBody';
import { Body, Small, Title } from './Text';

/**
 * Feuille « Répondre à … » : l'élément cité (photo ou réponse) et un mot de 140 caractères au plus,
 * qui part avec le like, juste sous l'élément. Le like peut aussi partir sans mot.
 */
export function ReplySheet({ name, target, onSend, onClose }: { name: string; target: LikeTarget; onSend: (comment: string) => Promise<unknown> | void; onClose: () => void }) {
  const [text, setText] = useState('');
  const urls = useSignedUrls(target.photoPath ? [target.photoPath] : []);
  const where = target.kind === 'photo' ? 'sous sa photo' : 'sous sa réponse';
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, justifyContent: 'flex-end' }]} testID="reply-sheet">
      <Backdrop onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetFrame>
          <Title size={24}>Répondre à {name}</Title>
          {target.kind === 'photo' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 12 }}>
              <Photo path={target.photoPath} url={target.photoPath ? urls[target.photoPath] : ''} name={name} initialSize={24} style={{ width: 64, height: 84, borderRadius: 14 }} />
              <Body weight="bold" size={16} style={{ flex: 1 }}>
                Sa photo
              </Body>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18, gap: 6 }}>
              {target.prompt ? (
                <Small weight="semibold" size={13.5}>
                  {target.prompt}
                </Small>
              ) : null}
              <Body weight="bold" size={18} style={{ lineHeight: 24 }}>
                {target.text}
              </Body>
            </View>
          )}
          <Field
            testID="reply-comment"
            label="Votre message"
            value={text}
            onChangeText={setText}
            placeholder={target.kind === 'photo' ? 'Une remarque, une question, une citation…' : 'Le dessert, vraiment ? Je tiens jusqu’au café.'}
            multiline
            maxLength={LIKE_COMMENT_MAX_LENGTH}
            counter
            hint={`Il part avec un like, juste ${where}.`}
            autoFocus={Platform.OS === 'web'}
          />
          <View style={{ gap: 6 }}>
            <Button
              testID="reply-send"
              label={text.trim() ? 'Envoyer avec un like' : 'Envoyer le like sans message'}
              icon={<HeartIcon size={20} color="#FFFFFF" filled />}
              onPress={() => onSend(text.trim())}
            />
            <Button label="Annuler" variant="ghost" onPress={onClose} />
          </View>
        </SheetFrame>
      </KeyboardAvoidingView>
    </View>
  );
}
