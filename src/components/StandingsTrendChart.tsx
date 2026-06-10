"use client";

import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSeries } from "@/lib/league";
import { PALETTE } from "./CumulativeChart";

type View = "points" | "rankings";

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

/**
 * Combined standings trend: toggle between cumulative points over time and
 * ranking position over time. Both consume the same {data, keys} ChartSeries
 * shape (points carry totals; rankings carry 1-based positions).
 */
export function StandingsTrendChart({
  pointsSeries,
  rankSeries,
  playerCount,
}: {
  pointsSeries: ChartSeries;
  rankSeries: ChartSeries;
  playerCount: number;
}) {
  const [view, setView] = useState<View>("points");
  const c = chartColors();
  const series = view === "points" ? pointsSeries : rankSeries;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label">
            {view === "points" ? "Cumulative points over time" : "Rankings over time"}
          </div>
          <p className="text-xs text-[var(--muted)]">
            {view === "points"
              ? "Total points as results arrive — all players"
              : "Lower = better · steps when a result reorders the table"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {(["points", "rankings"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                view === v
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {series.data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
          No scored matches yet — the chart fills in as results arrive.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series.data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="date" stroke={c.axis} fontSize={12} />
            {view === "points" ? (
              <YAxis stroke={c.axis} fontSize={12} allowDecimals />
            ) : (
              <YAxis
                stroke={c.axis}
                fontSize={12}
                domain={[1, playerCount]}
                reversed
                tickCount={playerCount}
                allowDecimals={false}
                tickFormatter={(v) => `#${v}`}
              />
            )}
            <Tooltip
              contentStyle={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }}
              formatter={view === "rankings" ? (val) => [`#${val}`, ""] : undefined}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.keys.map((k, i) => (
              <Line
                key={k}
                type={view === "points" ? "monotone" : "stepAfter"}
                dataKey={k}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
