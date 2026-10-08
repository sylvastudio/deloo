import { Text as RNText, type TextProps } from 'react-native';

import { type, type TypeVariant } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';

type Tone = 'ink' | 'slate' | 'faint' | 'lagoon' | 'red' | 'green' | 'onLagoon';

export function Text({ variant = 'body', tone = 'ink', style, ...rest }: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const c = useColors();
  return <RNText {...rest} style={[type[variant], { color: c[tone] }, style]} />;
}
