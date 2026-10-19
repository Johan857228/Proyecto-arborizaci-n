import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { chartColors, fonts } from '@/config/constants';
import type { ClaseFrecuencia, Regresion } from '@/features/laboratorio/estadistica';
import { formatNumero } from '@/shared/format';
import { useTema } from '@/theme';

/**
 * Gráficas del laboratorio dibujadas con SVG: histograma de una variable y dispersión DAP-altura
 * con la recta de regresión. Siempre con ejes rotulados y un resumen en texto para lectores de
 * pantalla (accessibilityLabel).
 */
const MARGEN = { izquierda: 44, derecha: 12, arriba: 14, abajo: 42 };

function useAncho() {
  const [ancho, setAncho] = useState(0);
  return { ancho, alMedir: (e: LayoutChangeEvent) => setAncho(Math.round(e.nativeEvent.layout.width)) };
}

/** Marcas "redondas" para un eje. */
function marcas(maximo: number, cuantas = 5) {
  if (maximo <= 0) return [0];
  const crudo = maximo / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = ([1, 2, 2.5, 5, 10].find((p) => p * potencia >= crudo) ?? 10) * potencia;
  const lista: number[] = [];
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) lista.push(Math.round(v * 1e6) / 1e6);
  if (lista[lista.length - 1] < maximo) lista.push(lista[lista.length - 1] + paso);
  return lista;
}

const decimalesDe = (v: number) => (Number.isInteger(v) ? 0 : 1);

export function Histograma({ tabla, unidad, etiqueta, alto = 240 }: { tabla: ClaseFrecuencia[]; unidad: string; etiqueta: string; alto?: number }) {
  const { palette } = useTema();
  const { ancho, alMedir } = useAncho();
  const maxF = Math.max(1, ...tabla.map((c) => c.frecuencia));
  const ejeY = marcas(maxF);
  const tope = ejeY[ejeY.length - 1];
  const w = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
  const h = alto - MARGEN.arriba - MARGEN.abajo;
  const barra = tabla.length ? w / tabla.length : 0;
  const y = (f: number) => MARGEN.arriba + h - (f / tope) * h;
  const resumen = `Histograma de ${etiqueta}: ${tabla.map((c) => `de ${formatNumero(c.desde, decimalesDe(c.desde))} a ${formatNumero(c.hasta, decimalesDe(c.hasta))} ${unidad}, ${c.frecuencia} árboles`).join('; ')}.`;
  // Con muchos intervalos y poco ancho se rotula uno sí y uno no.
  const salto = barra < 34 ? 2 : 1;

  return (
    <View onLayout={alMedir} accessible accessibilityRole="image" accessibilityLabel={resumen}>
      {ancho > 0 ? (
        <Svg width={ancho} height={alto}>
          {ejeY.map((v) => (
            <G key={v}>
              <Line x1={MARGEN.izquierda} x2={MARGEN.izquierda + w} y1={y(v)} y2={y(v)} stroke={palette.line} strokeWidth={1} />
              <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda - 6} y={y(v) + 4} fontSize={11} fill={palette.muted} textAnchor="end">{formatNumero(v, 0)}</SvgText>
            </G>
          ))}
          {tabla.map((c, i) => (
            <G key={c.desde}>
              <Rect
                x={MARGEN.izquierda + i * barra + 0.5}
                y={y(c.frecuencia)}
                width={Math.max(0, barra - 1)}
                height={Math.max(0, MARGEN.arriba + h - y(c.frecuencia))}
                fill={palette.forest}
                opacity={0.85}
              />
              {c.frecuencia ? (
                <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda + i * barra + barra / 2} y={y(c.frecuencia) - 4} fontSize={11} fill={palette.ink} textAnchor="middle" fontWeight="bold">
                  {c.frecuencia}
                </SvgText>
              ) : null}
            </G>
          ))}
          {tabla.map((c, i) => (i % salto === 0 ? (
            <SvgText fontFamily={fonts.semiBold} key={`x${c.desde}`} x={MARGEN.izquierda + i * barra} y={MARGEN.arriba + h + 16} fontSize={11} fill={palette.muted} textAnchor="middle">
              {formatNumero(c.desde, decimalesDe(c.desde))}
            </SvgText>
          ) : null))}
          {tabla.length ? (
            <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda + w} y={MARGEN.arriba + h + 16} fontSize={11} fill={palette.muted} textAnchor="middle">
              {formatNumero(tabla[tabla.length - 1].hasta, decimalesDe(tabla[tabla.length - 1].hasta))}
            </SvgText>
          ) : null}
          <Line x1={MARGEN.izquierda} x2={MARGEN.izquierda + w} y1={MARGEN.arriba + h} y2={MARGEN.arriba + h} stroke={palette.muted} strokeWidth={1} />
          <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda + w / 2} y={alto - 6} fontSize={12} fill={palette.ink} textAnchor="middle">{`${etiqueta} (${unidad})`}</SvgText>
          <SvgText fontFamily={fonts.semiBold} x={12} y={MARGEN.arriba + h / 2} fontSize={12} fill={palette.ink} textAnchor="middle" transform={`rotate(-90 12 ${MARGEN.arriba + h / 2})`}>
            Árboles
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

export function Dispersion({
  puntos,
  recta,
  alto = 280,
}: {
  puntos: { x: number; y: number; id: string }[];
  recta: Regresion | null;
  alto?: number;
}) {
  const { palette } = useTema();
  const { ancho, alMedir } = useAncho();
  const ejeX = marcas(Math.max(1, ...puntos.map((p) => p.x)));
  const ejeY = marcas(Math.max(1, ...puntos.map((p) => p.y)));
  const topeX = ejeX[ejeX.length - 1];
  const topeY = ejeY[ejeY.length - 1];
  const w = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
  const h = alto - MARGEN.arriba - MARGEN.abajo;
  const px = (v: number) => MARGEN.izquierda + (v / topeX) * w;
  const py = (v: number) => MARGEN.arriba + h - (v / topeY) * h;
  const minX = Math.min(...puntos.map((p) => p.x));
  const maxX = Math.max(...puntos.map((p) => p.x));
  const resumen = `Diagrama de dispersión de ${puntos.length} árboles: DAP en centímetros contra altura en metros.${recta ? ` Coeficiente de correlación ${formatNumero(recta.r, 2)}.` : ''}`;

  return (
    <View onLayout={alMedir} accessible accessibilityRole="image" accessibilityLabel={resumen}>
      {ancho > 0 ? (
        <Svg width={ancho} height={alto}>
          {ejeY.map((v) => (
            <G key={`y${v}`}>
              <Line x1={MARGEN.izquierda} x2={MARGEN.izquierda + w} y1={py(v)} y2={py(v)} stroke={palette.line} strokeWidth={1} />
              <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda - 6} y={py(v) + 4} fontSize={11} fill={palette.muted} textAnchor="end">{formatNumero(v, decimalesDe(v))}</SvgText>
            </G>
          ))}
          {ejeX.map((v) => (
            <SvgText fontFamily={fonts.semiBold} key={`x${v}`} x={px(v)} y={MARGEN.arriba + h + 16} fontSize={11} fill={palette.muted} textAnchor="middle">{formatNumero(v, decimalesDe(v))}</SvgText>
          ))}
          <Line x1={MARGEN.izquierda} x2={MARGEN.izquierda + w} y1={MARGEN.arriba + h} y2={MARGEN.arriba + h} stroke={palette.muted} strokeWidth={1} />
          <Line x1={MARGEN.izquierda} x2={MARGEN.izquierda} y1={MARGEN.arriba} y2={MARGEN.arriba + h} stroke={palette.muted} strokeWidth={1} />
          {puntos.map((p) => (
            <Circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={4} fill={chartColors.categorical[0]} fillOpacity={0.75} stroke={palette.paper} strokeWidth={1} />
          ))}
          {recta && puntos.length ? (
            // Solo dentro del rango de los datos: fuera de él la recta no está respaldada.
            <Line
              x1={px(minX)} y1={py(Math.max(0, recta.a + recta.b * minX))}
              x2={px(maxX)} y2={py(Math.max(0, recta.a + recta.b * maxX))}
              stroke={chartColors.categorical[1]} strokeWidth={2.5}
            />
          ) : null}
          <SvgText fontFamily={fonts.semiBold} x={MARGEN.izquierda + w / 2} y={alto - 6} fontSize={12} fill={palette.ink} textAnchor="middle">DAP (cm)</SvgText>
          <SvgText fontFamily={fonts.semiBold} x={12} y={MARGEN.arriba + h / 2} fontSize={12} fill={palette.ink} textAnchor="middle" transform={`rotate(-90 12 ${MARGEN.arriba + h / 2})`}>
            Altura (m)
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
