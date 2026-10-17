import { View } from 'react-native';

import { Icon } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

export function BrandMark({ size = 40 }: { size?: number }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Icon name="leaf" size={size * 0.55} color={palette.leaf} />
    </View>
  );
}

const useStyles = crearEstilos(({ palette, gradients }) => ({
  mark: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.forestDark, ...gradient(gradients.canopy) },
}));
