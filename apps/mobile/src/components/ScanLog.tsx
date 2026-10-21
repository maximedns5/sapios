import { View } from 'react-native';

import { alpha } from '@/lib/theme';
import { ClipReveal } from './ClipReveal';
import { Label, Mono } from './Text';
import { useTone } from './Tone';

export type LogLine = { text: string; result: string; bad?: boolean };

/** Journal de scan : ligne tapée par paliers, pointillés de conduite, résultat (inversé si « mauvais »). */
export function ScanLog({ lines, start, gap = 420, play = true }: { lines: LogLine[]; start: number; gap?: number; play?: boolean }) {
  const { fg, bg } = useTone();
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => (
        <ClipReveal key={i} delay={start + i * gap} duration={300} steps={24} play={play}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 30, paddingVertical: 4 }}>
            <Mono size={11.5} style={{ flexShrink: 1, lineHeight: 16 }}>
              › {line.text}
            </Mono>
            <View style={{ flex: 1, minWidth: 14, marginHorizontal: 8, marginBottom: 5, borderBottomWidth: 2, borderStyle: 'dotted', borderColor: alpha(fg, 0.35) }} />
            {line.bad ? (
              <View style={{ backgroundColor: fg, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Label color={bg} size={10.5} style={{ fontWeight: '700', letterSpacing: 1.2 }}>
                  {line.result}
                </Label>
              </View>
            ) : (
              <Label size={10.5} style={{ fontWeight: '700', letterSpacing: 1.2 }}>
                {line.result}
              </Label>
            )}
          </View>
        </ClipReveal>
      ))}
    </View>
  );
}
