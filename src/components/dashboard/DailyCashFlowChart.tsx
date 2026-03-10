"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DailyCashFlowProps {
  data: Array<{
    day: string;
    balance: number;
    payables: number;
    receivables: number;
  }>;
}

export function DailyCashFlowChart({ data }: DailyCashFlowProps) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900 sm:text-lg">
        Fluxo de Caixa Diário
      </h3>
      <div className="-mx-4 sm:mx-0">
        <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="day"
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
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Saldo"
            dot={{ fill: "#3b82f6", r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="payables"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="A Pagar"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="receivables"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="A Receber"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
