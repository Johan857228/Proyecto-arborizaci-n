import { StyleSheet, View } from 'react-native';

import { gradients, palette } from '@/config/constants';
import { Icon } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Icon name="leaf" size={size * 0.55} color={palette.leaf} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.forestDark, ...gradient(gradients.canopy) },
});
