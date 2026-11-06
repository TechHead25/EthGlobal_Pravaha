"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/primitives";
import { BarChart3 } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";

/**
 * Categorical palettes (navy/ivory, teal, emerald, amber, slate, sky). Recharts writes colors
 * as SVG attributes, so concrete values are chosen per theme instead of CSS variables.
 */
const PALETTES = {
  light: {
    series: ["hsl(222 47% 20%)", "hsl(172 55% 34%)", "hsl(152 52% 40%)", "hsl(34 80% 48%)", "hsl(215 16% 55%)", "hsl(200 70% 42%)"],
    grid: "hsl(220 14% 87%)",
    tick: "hsl(218 14% 40%)",
    cursor: "hsl(40 18% 93%)",
    tooltip: { background: "hsl(0 0% 100%)", border: "1px solid hsl(220 14% 87%)", color: "hsl(222 40% 12%)" },
    stroke: "hsl(0 0% 100%)",
  },
  dark: {
    series: ["hsl(40 25% 88%)", "hsl(172 55% 50%)", "hsl(152 50% 56%)", "hsl(38 88% 60%)", "hsl(215 16% 62%)", "hsl(200 80% 64%)"],
    grid: "hsl(222 20% 19%)",
    tick: "hsl(218 14% 66%)",
    cursor: "hsl(222 24% 15%)",
    tooltip: { background: "hsl(223 28% 12%)", border: "1px solid hsl(222 20% 22%)", color: "hsl(40 20% 93%)" },
    stroke: "hsl(223 28% 10.5%)",
  },
} as const;

function usePalette() {
  return PALETTES[useTheme().resolved];
}

const usdc = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;

function ChartEmpty({ label }: { label: string }) {
  return <EmptyState icon={BarChart3} title={label} className="h-full min-h-[200px] border-none bg-transparent" />;
}

export interface DonutDatum {
  name: string;
  value: number;
}

export function DonutChart({ data, emptyLabel = "No data yet", height = 220, valueFormatter = usdc }: { data: DonutDatum[]; emptyLabel?: string; height?: number; valueFormatter?: (n: number) => string }) {
  const pal = usePalette();
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return <ChartEmpty label={emptyLabel} />;
  const total = filtered.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke={pal.stroke} strokeWidth={2}>
            {filtered.map((_, i) => (
              <Cell key={i} fill={pal.series[i % pal.series.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [`${valueFormatter(v)} · ${((v / total) * 100).toFixed(1)}%`]} contentStyle={{ borderRadius: 8, fontSize: 12, ...pal.tooltip }} itemStyle={{ color: pal.tooltip.color }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: pal.tick }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BarSeries {
  key: string;
  label: string;
}

export function StackedBars({
  data,
  series,
  xKey,
  emptyLabel = "No data yet",
  height = 240,
  valueFormatter = usdc,
  stacked = true,
}: {
  data: Record<string, number | string>[];
  series: BarSeries[];
  xKey: string;
  emptyLabel?: string;
  height?: number;
  valueFormatter?: (n: number) => string;
  stacked?: boolean;
}) {
  const pal = usePalette();
  const hasData = data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  if (!hasData) return <ChartEmpty label={emptyLabel} />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={pal.grid} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: pal.tick }} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tick={{ fill: pal.tick }} tickFormatter={(v: number) => v.toLocaleString("en-US", { notation: "compact" })} />
          <Tooltip formatter={(v: number, n: string) => [valueFormatter(v), n]} contentStyle={{ borderRadius: 8, fontSize: 12, ...pal.tooltip }} labelStyle={{ color: pal.tooltip.color }} cursor={{ fill: pal.cursor }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: pal.tick }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={pal.series[i % pal.series.length]} radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]} maxBarSize={42} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Convert a 6-decimal USDC bigint to a chart number (display only). */
export function toChartNumber(v: bigint, decimals = 6): number {
  return Number(v) / 10 ** decimals;
}
