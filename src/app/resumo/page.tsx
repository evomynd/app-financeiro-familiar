"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, RefreshCw } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CategoryBudget, CreditCard, Transaction } from "@/types/firestore";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt = (v: number) => `R$ ${brlFormatter.format(v)}`;

const now = new Date();
const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i);

interface MonthRow {
  period: string; // yyyy-MM
  month: string;
  incomeBudget: number;
  incomeRealized: number;
  expenseRealized: number;
  balance: number;      // incomeRealized - expenseRealized
  accumulated: number;  // soma acumulada até este mês
}

export default function ResumoPage() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError("");
    try {
      const [txSnap, budgetSnap, cardSnap] = await Promise.all([
        getDocs(query(collection(db, "transactions"), where("user_id", "==", user.uid))),
        getDocs(query(collection(db, "categoryBudgets"), where("user_id", "==", user.uid))),
        getDocs(query(collection(db, "creditCards"), where("user_id", "==", user.uid))),
      ]);
      setTransactions(txSnap.docs.map((d) => d.data() as Transaction));
      setBudgets(budgetSnap.docs.map((d) => d.data() as CategoryBudget));
      setCreditCards(cardSnap.docs.map((d) => d.data() as CreditCard));
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.uid) loadData();
  }, [user?.uid]);

  const creditCardMap = useMemo(
    () => new Map(creditCards.map((c) => [c.id, c])),
    [creditCards],
  );

  const getBillingPeriod = (tx: Transaction): string => {
    if (tx.payment_method === "credit_card" && tx.credit_card_id) {
      const card = creditCardMap.get(tx.credit_card_id);
      if (card) {
        const [year, month, day] = tx.date.slice(0, 10).split("-").map(Number);
        if (day > card.closing_day) {
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;
          return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
        }
      }
    }
    return tx.date.slice(0, 7);
  };

  const rows = useMemo<MonthRow[]>(() => {
    const result: MonthRow[] = [];
    let accumulated = 0;

    for (let m = 1; m <= 12; m++) {
      const period = `${selectedYear}-${String(m).padStart(2, "0")}`;

      const txInPeriod = transactions.filter(
        (tx) => tx.status !== "cancelled" && getBillingPeriod(tx) === period,
      );

      const incomeRealized = txInPeriod
        .filter((tx) => tx.type === "income")
        .reduce((sum, tx) => sum + tx.amount, 0);

      const expenseRealized = txInPeriod
        .filter((tx) => tx.type === "expense")
        .reduce((sum, tx) => sum + tx.amount, 0);

      const incomeBudget = budgets
        .filter((b) => b.period === period && b.type === "income")
        .reduce((sum, b) => sum + b.budgeted_amount, 0);

      const balance = incomeRealized - expenseRealized;
      accumulated += balance;

      result.push({
        period,
        month: monthNames[m - 1],
        incomeBudget,
        incomeRealized,
        expenseRealized,
        balance,
        accumulated,
      });
    }

    return result;
  }, [transactions, budgets, selectedYear, creditCardMap]);

  const totals = useMemo(() => ({
    incomeBudget: rows.reduce((s, r) => s + r.incomeBudget, 0),
    incomeRealized: rows.reduce((s, r) => s + r.incomeRealized, 0),
    expenseRealized: rows.reduce((s, r) => s + r.expenseRealized, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
  }), [rows]);

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Faça login para acessar</h2>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resumo Anual</h1>
          <p className="mt-1 text-sm text-gray-600">
            Visão consolidada de receitas, despesas, saldo e acumulado mês a mês.
          </p>
        </div>

        {/* Controles */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ano</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Tabela */}
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Receita Prevista</th>
                  <th className="px-4 py-3 text-right">Receita Realizada</th>
                  <th className="px-4 py-3 text-right">Despesa Realizada</th>
                  <th className="px-4 py-3 text-right">Saldo do Mês</th>
                  <th className="px-4 py-3 text-right">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-200" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  rows.map((row) => {
                    const isFuture = row.period > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                    const isEmpty = row.incomeRealized === 0 && row.expenseRealized === 0;
                    return (
                      <tr
                        key={row.period}
                        className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${isFuture && isEmpty ? "text-gray-500" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium">{row.month}</td>
                        <td className="px-4 py-3 text-right">
                          {row.incomeBudget > 0 ? (
                            <span className="text-gray-700">{fmt(row.incomeBudget)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.incomeRealized > 0 ? (
                            <span className="font-semibold text-green-700">{fmt(row.incomeRealized)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.expenseRealized > 0 ? (
                            <span className="font-semibold text-red-600">{fmt(row.expenseRealized)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.incomeRealized === 0 && row.expenseRealized === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span className={`font-semibold ${row.balance >= 0 ? "text-green-700" : "text-red-600"}`}>
                              {fmt(row.balance)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.incomeRealized === 0 && row.expenseRealized === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span className={`font-bold ${row.accumulated >= 0 ? "text-blue-700" : "text-red-700"}`}>
                              {fmt(row.accumulated)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-gray-900">
                    <td className="px-4 py-3 text-sm uppercase tracking-wide">Total</td>
                    <td className="px-4 py-3 text-right text-sm">{fmt(totals.incomeBudget)}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-700">{fmt(totals.incomeRealized)}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600">{fmt(totals.expenseRealized)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${totals.balance >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {fmt(totals.balance)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
