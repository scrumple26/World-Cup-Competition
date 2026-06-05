"use client";

import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSeries } from "@/lib/league";

export const PALETTE = [
  "#e31837", "#2A398D", "#e6c23a", "#f472b6", "#a78bfa", "#fb923c",
  "#3CAC3B", "#60a5fa", "#facc15", "#fb7185", "#c084fc", "#4ade80",
  "#2dd4bf", "#818cf8", "#fbbf24", "#f87171",
];

function chartColors() {
  const style = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement)
    : null;
  return {
    grid:    style?.getPropertyValue("--border").trim()   || "#D1D4D1",
    axis:    style?.getPropertyValue("--muted").trim()    || "#6b7a8d",
    bg:      style?.getPropertyValue("--bg-elev").trim()  || "#f2f4f8",
    border:  style?.getPropertyValue("--border").trim()   || "#D1D4D1",
  };
}

export function CumulativeChart({ series }: { series: ChartSeries }) {
  const c = chartColors();

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
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" stroke={c.axis} fontSize={12} />
        <YAxis stroke={c.axis} fontSize={12} allowDecimals />
        <Tooltip
          contentStyle={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
