"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import type { ProjectionRow } from "@/lib/league";

const QUALIFY_COLOR = "#22c55e";
const BUBBLE_COLOR = "#6b7a8d";

function chartColors() {
  const style = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement)
    : null;
  return {
    grid:   style?.getPropertyValue("--border").trim()  || "#D1D4D1",
    axis:   style?.getPropertyValue("--muted").trim()   || "#6b7a8d",
    bg:     style?.getPropertyValue("--bg-elev").trim() || "#f2f4f8",
    border: style?.getPropertyValue("--border").trim()  || "#D1D4D1",
  };
}

interface ChartRow {
  name: string;
  current: number;
  gain: number;
  projectedTotal: number;
  qualified: boolean;
}

export function ProjectionChart({
  rows,
  playedMatchCount,
  totalMatchCount,
}: {
  rows: ProjectionRow[];
  playedMatchCount: number;
  totalMatchCount: number;
}) {
  const c = chartColors();
  const remaining = Math.max(0, totalMatchCount - playedMatchCount);

  if (playedMatchCount === 0) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-[var(--muted)]">
        Projections appear once matches are scored.
      </div>
    );
  }

  // recharts vertical layout renders bottom-to-top, so reverse for top-to-bottom display
  const chartData: ChartRow[] = [...rows].reverse().map((r) => ({
    name: r.teamName,
    current: r.current,
    gain: Math.round(r.projectedGain * 10) / 10,
    projectedTotal: Math.round(r.projectedTotal * 10) / 10,
    qualified: r.qualified,
  }));

  return (
    <div>
      <p className="mb-2 text-xs text-[var(--muted)]">
        {playedMatchCount} match{playedMatchCount !== 1 ? "es" : ""} played · {remaining} remaining · based on current pts/match rate
      </p>
      <ResponsiveContainer width="100%" height={rows.length * 52 + 24}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 0, bottom: 0 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
          <XAxis type="number" stroke={c.axis} fontSize={11} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            stroke={c.axis}
            fontSize={12}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) =>
              name === "gain"
                ? [`+${Number(value)}`, "Projected gain"]
                : [Number(value), "Current pts"]
            }
          />
          <Bar dataKey="current" stackId="pts" name="current" radius={[0, 0, 0, 0]}>
            {chartData.map((row, i) => (
              <Cell
                key={i}
                fill={row.qualified ? QUALIFY_COLOR : BUBBLE_COLOR}
                fillOpacity={0.9}
              />
            ))}
          </Bar>
          <Bar dataKey="gain" stackId="pts" name="gain" radius={[0, 4, 4, 0]}>
            {chartData.map((row, i) => (
              <Cell
                key={i}
                fill={row.qualified ? QUALIFY_COLOR : BUBBLE_COLOR}
                fillOpacity={0.35}
              />
            ))}
            <LabelList
              dataKey="projectedTotal"
              position="right"
              formatter={(v: unknown) => String(v)}
              style={{ fontSize: 11, fill: c.axis }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-[var(--muted)]">
        Green = projected top 2 (qualifying position)
      </p>
    </div>
  );
}
