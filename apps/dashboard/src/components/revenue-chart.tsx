"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenueDataPoint } from "@veyra/types";

interface RevenueChartProps {
  data: RevenueDataPoint[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5.9% 90%)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "hsl(240 3.8% 46.1%)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(240 3.8% 46.1%)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `\u20AC${v}`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-emerald-600">
                  Recovered: &euro;{payload[0]?.value?.toLocaleString()}
                </p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="recovered"
          stroke="hsl(240 5.9% 10%)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorRevenue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
