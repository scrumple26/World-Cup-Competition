"use client";

import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSeries } from "@/lib/league";
import { PALETTE } from "./CumulativeChart";

function chartColors() {
  const style = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement) : null;
  return {
    grid:   style?.getPropertyValue("--border").trim()  || "#D1D4D1",
    axis:   style?.getPropertyValue("--muted").trim()   || "#6b7a8d",
    bg:     style?.getPropertyValue("--bg-elev").trim() || "#f2f4f8",
    border: style?.getPropertyValue("--border").trim()  || "#D1D4D1",
  };
}

export function RankingsChart({
  series,
  playerCount,
}: {
  series: ChartSeries;
  playerCount: number;
}) {
  const c = chartColors();

  if (series.data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
        Rankings chart fills in as match results arrive.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={series.data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" stroke={c.axis} fontSize={12} />
        <YAxis
          stroke={c.axis}
          fontSize={12}
          domain={[1, playerCount]}
          reversed
          tickCount={playerCount}
          allowDecimals={false}
          tickFormatter={(v) => `#${v}`}
        />
        <Tooltip
          contentStyle={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }}
          formatter={(val) => [`#${val}`, ""]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.keys.map((k, i) => (
          <Line
            key={k}
            type="stepAfter"
            dataKey={k}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
