"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/primitives";
import { BarChart3 } from "lucide-react";

/** Validated, theme-consistent categorical palette (navy, teal, emerald, amber, slate, sky). */
export const CHART_COLORS = ["hsl(222 47% 20%)", "hsl(172 55% 34%)", "hsl(152 52% 40%)", "hsl(34 80% 48%)", "hsl(215 16% 55%)", "hsl(200 70% 42%)"];

const usdc = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;

function ChartEmpty({ label }: { label: string }) {
  return <EmptyState icon={BarChart3} title={label} className="h-full min-h-[200px] border-none bg-transparent" />;
}

export interface DonutDatum {
  name: string;
  value: number;
}

export function DonutChart({ data, emptyLabel = "No data yet", height = 220, valueFormatter = usdc }: { data: DonutDatum[]; emptyLabel?: string; height?: number; valueFormatter?: (n: number) => string }) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return <ChartEmpty label={emptyLabel} />;
  const total = filtered.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
            {filtered.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [`${valueFormatter(v)} · ${((v / total) * 100).toFixed(1)}%`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
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
  const hasData = data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  if (!hasData) return <ChartEmpty label={emptyLabel} />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => v.toLocaleString("en-US", { notation: "compact" })} />
          <Tooltip formatter={(v: number, n: string) => [valueFormatter(v), n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]} maxBarSize={42} />
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
