import type { PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useColors } from '@/theme/use-colors';

/** Widest the app gets on a laptop; phones (narrower) are unchanged. */
export const WEB_COLUMN = 560;

/** Web: the phone app in a centred column on wide screens, with a hairline edge either side. */
export function WebFrame({ children }: PropsWithChildren) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const wide = width > WEB_COLUMN;
  return (
    <View style={[styles.outer, { backgroundColor: c.paper }]}>
      <View style={[styles.column, { backgroundColor: c.paper }, wide && { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.line }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: WEB_COLUMN, overflow: 'hidden' },
});
