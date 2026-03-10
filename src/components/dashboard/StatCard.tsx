"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  variant?: "primary" | "success" | "danger" | "warning";
  icon?: ReactNode;
}

const variantStyles = {
  primary: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-green-50 text-green-700 border-green-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-orange-50 text-orange-700 border-orange-200",
};

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  variant = "primary",
  icon,
}: StatCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
            {subtitle && (
              <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
            )}
          </div>
          {icon && (
            <div
              className={`rounded-lg border p-2 ${variantStyles[variant]}`}
            >
              {icon}
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-xs font-medium">
            {trend === "up" && (
              <>
                <span className="text-green-600">↑</span>
                <span className="text-green-600">Positivo</span>
              </>
            )}
            {trend === "down" && (
              <>
                <span className="text-red-600">↓</span>
                <span className="text-red-600">Negativo</span>
              </>
            )}
            {trend === "neutral" && (
              <>
                <span className="text-gray-600">→</span>
                <span className="text-gray-600">Neutro</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
