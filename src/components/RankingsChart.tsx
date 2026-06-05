"use client";

import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSeries } from "@/lib/league";
import { PALETTE } from "./CumulativeChart";

export function RankingsChart({
  series,
  playerCount,
}: {
  series: ChartSeries;
  playerCount: number;
}) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="#1a3560" />
        <XAxis dataKey="date" stroke="#7a90b8" fontSize={12} />
        {/* Invert Y: rank 1 at top, rank N at bottom */}
        <YAxis
          stroke="#7a90b8"
          fontSize={12}
          domain={[1, playerCount]}
          reversed
          tickCount={playerCount}
          allowDecimals={false}
          tickFormatter={(v) => `#${v}`}
        />
        <Tooltip
          contentStyle={{
            background: "#0a1628",
            border: "1px solid #1a3560",
            borderRadius: 8,
            fontSize: 12,
          }}
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
