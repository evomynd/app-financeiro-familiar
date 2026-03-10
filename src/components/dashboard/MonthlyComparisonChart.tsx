"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthlyComparisonProps {
  data: Array<{
    month: string;
    income: number;
    expenses: number;
  }>;
}

export function MonthlyComparisonChart({ data }: MonthlyComparisonProps) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900 sm:text-lg">
        Receitas vs Despesas
      </h3>
      <div className="-mx-4 sm:mx-0">
        <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            tickLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 12 }}
            tickLine={{ stroke: "#e5e7eb" }}
            tickFormatter={(value) =>
              `R$ ${(value / 1000).toFixed(0)}k`
            }
          />
          <Tooltip
            formatter={(value) => {
              const numValue = typeof value === "number" ? value : 0;
              return `R$ ${numValue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`;
            }}
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          <Legend />
          <Bar dataKey="income" fill="#10b981" name="Receitas" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" fill="#ef4444" name="Despesas" radius={[4, 4, 0, 0]} />
        </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
