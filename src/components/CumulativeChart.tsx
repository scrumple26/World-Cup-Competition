"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSeries } from "@/lib/league";

const PALETTE = [
  "#22c55e", "#38bdf8", "#f5c451", "#f472b6", "#a78bfa", "#fb923c",
  "#34d399", "#60a5fa", "#facc15", "#fb7185", "#c084fc", "#4ade80",
  "#2dd4bf", "#818cf8", "#fbbf24", "#f87171",
];

export function CumulativeChart({ series }: { series: ChartSeries }) {
  if (series.data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
        No scored matches yet — the chart fills in as results arrive.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={series.data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#243049" />
        <XAxis dataKey="date" stroke="#93a1bd" fontSize={12} />
        <YAxis stroke="#93a1bd" fontSize={12} allowDecimals />
        <Tooltip
          contentStyle={{
            background: "#131c2e",
            border: "1px solid #243049",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
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
