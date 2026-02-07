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

export function RevenueChart({ data }: { data: RevenueDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradientRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradientFees" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(152, 69%, 40%)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(152, 69%, 40%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 8%, 92%)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
          }}
          tick={{ fontSize: 11, fill: "hsl(234, 10%, 48%)" }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(234, 10%, 48%)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
          }
        />
        <Tooltip
          contentStyle={{
            background: "hsl(234, 25%, 12%)",
            border: "none",
            borderRadius: "8px",
            padding: "10px 14px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
          labelStyle={{ color: "hsl(240, 10%, 60%)", fontSize: 11, marginBottom: 4 }}
          itemStyle={{ color: "#fff", fontSize: 12, padding: 0 }}
          labelFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-IE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          }
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              recovered: "Recovered",
              fees: "Fees",
              discounts: "Discounts",
            };
            return [`€${value.toLocaleString()}`, labels[name] ?? name];
          }}
        />
        <Area
          type="monotone"
          dataKey="recovered"
          stroke="hsl(262, 83%, 58%)"
          strokeWidth={2.5}
          fill="url(#gradientRevenue)"
          dot={false}
          activeDot={{ r: 4, fill: "hsl(262, 83%, 58%)", stroke: "#fff", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="fees"
          stroke="hsl(152, 69%, 40%)"
          strokeWidth={1.5}
          fill="url(#gradientFees)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
