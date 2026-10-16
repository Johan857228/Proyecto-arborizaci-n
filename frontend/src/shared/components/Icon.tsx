import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { palette } from '@/config/constants';

// Cada icono se define una vez: SF Symbols en iOS y Material Symbols en Android y web.
const icons = {
  leaf: { ios: 'leaf.fill', material: 'eco' },
  tree: { ios: 'tree.fill', material: 'park' },
  home: { ios: 'house.fill', material: 'home' },
  list: { ios: 'list.bullet.rectangle', material: 'inventory_2' },
  add: { ios: 'plus', material: 'add' },
  addCircle: { ios: 'plus.circle.fill', material: 'add_circle' },
  search: { ios: 'magnifyingglass', material: 'search' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', material: 'logout' },
  camera: { ios: 'camera.fill', material: 'photo_camera' },
  addPhoto: { ios: 'photo.badge.plus', material: 'add_photo_alternate' },
  location: { ios: 'mappin.and.ellipse', material: 'location_on' },
  myLocation: { ios: 'location.fill', material: 'my_location' },
  ruler: { ios: 'ruler', material: 'straighten' },
  height: { ios: 'arrow.up.and.down', material: 'height' },
  check: { ios: 'checkmark', material: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', material: 'check_circle' },
  warning: { ios: 'exclamationmark.triangle.fill', material: 'warning' },
  error: { ios: 'xmark.octagon.fill', material: 'error' },
  info: { ios: 'info.circle.fill', material: 'info' },
  refresh: { ios: 'arrow.clockwise', material: 'refresh' },
  back: { ios: 'chevron.left', material: 'arrow_back' },
  forward: { ios: 'arrow.right', material: 'arrow_forward' },
  chevronRight: { ios: 'chevron.right', material: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', material: 'chevron_left' },
  gallery: { ios: 'photo.on.rectangle.angled', material: 'photo_library' },
  openExternal: { ios: 'arrow.up.right.square', material: 'open_in_new' },
  close: { ios: 'xmark', material: 'close' },
  co2: { ios: 'cloud.fill', material: 'co2' },
  air: { ios: 'wind', material: 'air' },
  biomass: { ios: 'scalemass.fill', material: 'grass' },
  building: { ios: 'building.2.fill', material: 'apartment' },
  lock: { ios: 'lock.fill', material: 'lock' },
  mail: { ios: 'envelope.fill', material: 'mail' },
  calendar: { ios: 'calendar', material: 'today' },
  trending: { ios: 'chart.line.uptrend.xyaxis', material: 'trending_up' },
  pest: { ios: 'ant.fill', material: 'pest_control' },
  roots: { ios: 'leaf.arrow.triangle.circlepath', material: 'psychiatry' },
  // Módulos
  modules: { ios: 'square.grid.2x2.fill', material: 'apps' },
  review: { ios: 'checkmark.seal.fill', material: 'fact_check' },
  tools: { ios: 'wrench.and.screwdriver.fill', material: 'construction' },
  school: { ios: 'graduationcap.fill', material: 'school' },
  trophy: { ios: 'trophy.fill', material: 'emoji_events' },
  chart: { ios: 'chart.bar.fill', material: 'bar_chart' },
  flag: { ios: 'flag.fill', material: 'flag' },
  wallet: { ios: 'banknote.fill', material: 'payments' },
  tune: { ios: 'slider.horizontal.3', material: 'tune' },
  settings: { ios: 'gearshape.fill', material: 'settings' },
  users: { ios: 'person.2.fill', material: 'group' },
  person: { ios: 'person.crop.circle.fill', material: 'account_circle' },
  sparkle: { ios: 'sparkles', material: 'auto_awesome' },
} satisfies Record<string, { ios: SFSymbol; material: AndroidSymbol }>;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 20,
  color = palette.ink,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const symbol = icons[name];
  return (
    <SymbolView
      name={{ ios: symbol.ios, android: symbol.material, web: symbol.material }}
      size={size}
      tintColor={color}
      style={style}
    />
  );
}
