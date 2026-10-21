import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';

/**
 * Zone de dépôt de fichiers (web). Le rendu dépend de `over` (fichier survolant la zone) ; un fichier lâché
 * à côté n'est pas ouvert par le navigateur tant que la zone est affichée. Sans effet sur natif.
 */
export function DropTarget({
  onFiles,
  disabled,
  style,
  testID,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: (over: boolean) => ReactNode;
}) {
  const ref = useRef<ViewInstance>(null);
  const handler = useRef(onFiles);
  handler.current = onFiles;
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    let depth = 0;
    const withFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!withFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const dragOver = (e: DragEvent) => {
      if (!withFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) handler.current(files);
    };
    const block = (e: DragEvent) => {
      if (withFiles(e)) e.preventDefault();
    };
    el.addEventListener('dragenter', enter);
    el.addEventListener('dragover', dragOver);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      el.removeEventListener('dragenter', enter);
      el.removeEventListener('dragover', dragOver);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
      setOver(false);
    };
  }, [disabled]);

  return (
    <View ref={ref} style={style} testID={testID}>
      {children(over && !disabled)}
    </View>
  );
}
