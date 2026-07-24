/**
 * RadarChartWrapper.tsx — Custom Skia radar / spider chart.
 *
 * victory-native does not include a radar chart, so this component
 * renders directly onto a Skia Canvas. Matches the visual style of
 * the web PerformanceRadar (reports.tsx) using the same RadarAxis data shape.
 *
 * Architecture:
 *   - Skia Canvas for all drawing (grid polygons, axis lines, data polygon)
 *   - React Native View for axis labels (overlaid absolutely)
 *   - No external chart library dependencies beyond @shopify/react-native-skia
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, Path, Skia, Circle } from "@shopify/react-native-skia";

import {
  DEFAULT_RADAR_HEIGHT,
  RADAR_GRID_LEVELS,
  RADAR_LABEL_PADDING,
  RADAR_STROKE_WIDTH,
  RADAR_DATA_STROKE_W,
} from "./chartConfig";
import {
  CHART_THEME,
  CHART_COLORS,
  CHART_FONT_SIZE,
} from "./chartTheme";
import type { PerformanceRadarChartProps, RadarAxis } from "../../app/(tabs)/reports";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RadarChartWrapperProps {
  data:    RadarAxis[];
  color?:  string;
  height?: number;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

/** Convert polar coordinates to Cartesian, starting from the top (−π/2). */
function polar(
  cx: number,
  cy: number,
  r:  number,
  angle: number, // angle in radians, 0 = top
): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angle - Math.PI / 2),
    y: cy + r * Math.sin(angle - Math.PI / 2),
  };
}

/** Build a closed SVG path for a regular polygon with n vertices. */
function makePolygonPath(
  cx:     number,
  cy:     number,
  r:      number,
  n:      number,
): ReturnType<typeof Skia.Path.Make> {
  const path  = Skia.Path.Make();
  const step  = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const { x, y } = polar(cx, cy, r, i * step);
    if (i === 0) path.moveTo(x, y);
    else          path.lineTo(x, y);
  }
  path.close();
  return path;
}

/** Build a closed path connecting the data scores around the radar axes. */
function makeDataPath(
  cx:     number,
  cy:     number,
  radius: number,
  data:   RadarAxis[],
): ReturnType<typeof Skia.Path.Make> {
  const path = Skia.Path.Make();
  const n    = data.length;
  const step = (2 * Math.PI) / n;
  data.forEach((d, i) => {
    const r      = radius * (d.score / 100);
    const { x, y } = polar(cx, cy, r, i * step);
    if (i === 0) path.moveTo(x, y);
    else          path.lineTo(x, y);
  });
  path.close();
  return path;
}

// ── Component ──────────────────────────────────────────────────────────────

export const RadarChartWrapper = memo(function RadarChartWrapper({
  data,
  color  = CHART_COLORS.radar,
  height = DEFAULT_RADAR_HEIGHT,
}: RadarChartWrapperProps) {
  const n = data.length;

  // Canvas size — square canvas fitted to width
  const size   = height;
  const cx     = size / 2;
  const cy     = size / 2;
  const radius = size / 2 - RADAR_LABEL_PADDING;
  const step   = (2 * Math.PI) / n;

  // ── Skia paint objects ─────────────────────────────────────────────────

  const gridPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setStyle(1); // stroke
    p.setColor(Skia.Color(CHART_THEME.radarGridStroke));
    p.setStrokeWidth(RADAR_STROKE_WIDTH);
    p.setAntiAlias(true);
    return p;
  }, []);

  const gridFillPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setStyle(0); // fill
    p.setColor(Skia.Color(CHART_THEME.radarGridFill));
    p.setAntiAlias(true);
    return p;
  }, []);

  const dataFillPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setStyle(0); // fill
    p.setColor(Skia.Color(CHART_THEME.radarDataFill));
    p.setAntiAlias(true);
    return p;
  }, []);

  const dataStrokePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setStyle(1); // stroke
    p.setColor(Skia.Color(color));
    p.setStrokeWidth(RADAR_DATA_STROKE_W);
    p.setAntiAlias(true);
    return p;
  }, [color]);

  const dotPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setStyle(0); // fill
    p.setColor(Skia.Color(color));
    p.setAntiAlias(true);
    return p;
  }, [color]);

  // ── Paths ──────────────────────────────────────────────────────────────

  const gridPaths = useMemo(
    () =>
      Array.from({ length: RADAR_GRID_LEVELS }, (_, lvl) => {
        const r = (radius * (lvl + 1)) / RADAR_GRID_LEVELS;
        return makePolygonPath(cx, cy, r, n);
      }),
    [cx, cy, radius, n],
  );

  const axisLinePaths = useMemo(
    () =>
      data.map((_, i) => {
        const { x, y } = polar(cx, cy, radius, i * step);
        const path      = Skia.Path.Make();
        path.moveTo(cx, cy);
        path.lineTo(x, y);
        return path;
      }),
    [data, cx, cy, radius, step],
  );

  const dataPath = useMemo(
    () => (n > 0 ? makeDataPath(cx, cy, radius, data) : null),
    [cx, cy, radius, data, n],
  );

  // ── Vertex points on data polygon (for dot markers) ────────────────────

  const dataPoints = useMemo(
    () =>
      data.map((d, i) => {
        const r = radius * (d.score / 100);
        return polar(cx, cy, r, i * step);
      }),
    [data, cx, cy, radius, step],
  );

  // ── Axis label positions ───────────────────────────────────────────────
  // Positioned just outside the radar perimeter with a small offset.

  const labelPositions = useMemo(
    () =>
      data.map((d, i) => {
        const angle   = i * step;
        const labelR  = radius + RADAR_LABEL_PADDING * 0.72;
        const { x, y } = polar(cx, cy, labelR, angle);
        // Determine alignment based on position around the circle
        const cos     = Math.cos(angle - Math.PI / 2);
        const sin     = Math.sin(angle - Math.PI / 2);
        let textAlign: "left" | "center" | "right" = "center";
        if (cos > 0.35)       textAlign = "left";
        else if (cos < -0.35) textAlign = "right";
        return { x, y, sin, cos, textAlign, label: d.metric, score: d.score };
      }),
    [data, cx, cy, radius, step],
  );

  if (n < 3) return null;

  return (
    <View style={[styles.root, { height }]}>
      {/* Skia canvas — grid + data polygon */}
      <Canvas style={[StyleSheet.absoluteFill]}>
        {/* Filled grid levels (outermost to innermost so fills stack correctly) */}
        {gridPaths.map((path, i) => (
          <Path key={`gf-${i}`} path={path} paint={gridFillPaint} />
        ))}
        {/* Grid level strokes */}
        {gridPaths.map((path, i) => (
          <Path key={`gs-${i}`} path={path} paint={gridPaint} />
        ))}
        {/* Axis lines */}
        {axisLinePaths.map((path, i) => (
          <Path key={`al-${i}`} path={path} paint={gridPaint} />
        ))}
        {/* Data polygon fill */}
        {dataPath && <Path path={dataPath} paint={dataFillPaint} />}
        {/* Data polygon stroke */}
        {dataPath && <Path path={dataPath} paint={dataStrokePaint} />}
        {/* Vertex dots */}
        {dataPoints.map((pt, i) => (
          <Circle key={`dot-${i}`} cx={pt.x} cy={pt.y} r={3.5} paint={dotPaint} />
        ))}
      </Canvas>

      {/* Axis labels — React Native Views overlaid on the canvas */}
      {labelPositions.map((pos) => (
        <View
          key={pos.label}
          style={[
            styles.labelWrap,
            {
              left:      pos.x - 40,
              top:       pos.y - 10,
              width:     80,
              alignItems:
                pos.textAlign === "left"
                  ? "flex-start"
                  : pos.textAlign === "right"
                  ? "flex-end"
                  : "center",
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.axisLabel} numberOfLines={1}>
            {pos.label}
          </Text>
          <Text style={[styles.scoreLabel, { color: CHART_COLORS.accent }]}>
            {pos.score.toFixed(0)}
          </Text>
        </View>
      ))}
    </View>
  );
});

// ── Reports-contract alias ─────────────────────────────────────────────────

export const PerformanceRadarChartImpl = memo(function PerformanceRadarChartImpl({
  data,
  color,
  height,
}: PerformanceRadarChartProps) {
  return <RadarChartWrapper data={data} color={color} height={height} />;
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width:    "100%",
    position: "relative",
  },
  labelWrap: {
    position: "absolute",
  },
  axisLabel: {
    fontSize:  CHART_FONT_SIZE.axis,
    color:     CHART_THEME.axisLabel,
    textAlign: "center",
  },
  scoreLabel: {
    fontSize:   CHART_FONT_SIZE.axis,
    fontWeight: "600",
    textAlign:  "center",
  },
});
