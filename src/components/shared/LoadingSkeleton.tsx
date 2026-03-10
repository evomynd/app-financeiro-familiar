"use client";

export function StatCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <div className="h-4 w-24 rounded bg-gray-200"></div>
            <div className="h-8 w-32 rounded bg-gray-300"></div>
            <div className="h-3 w-20 rounded bg-gray-200"></div>
          </div>
          <div className="h-12 w-12 rounded-lg bg-gray-200"></div>
        </div>
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 h-6 w-48 rounded bg-gray-200"></div>
      <div className="h-64 rounded bg-gray-100"></div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="h-5 w-5 rounded bg-gray-200"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-300"></div>
            <div className="h-3 w-1/2 rounded bg-gray-200"></div>
          </div>
          <div className="h-4 w-20 rounded bg-gray-200"></div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-gray-200"></div>
        <div className="h-6 w-24 rounded bg-gray-300"></div>
        <div className="flex gap-2">
          <div className="h-3 w-16 rounded bg-gray-200"></div>
          <div className="h-3 w-16 rounded bg-gray-200"></div>
        </div>
      </div>
    </div>
  );
}
