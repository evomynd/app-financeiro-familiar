"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { MonthlyComparisonChart } from "@/components/dashboard/MonthlyComparisonChart";
import { DailyCashFlowChart } from "@/components/dashboard/DailyCashFlowChart";
import { StatCardSkeleton, ChartSkeleton } from "@/components/shared/LoadingSkeleton";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Target,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { getUserProfile } from "@/lib/actions/users";
import { startOfMonth, endOfMonth, format, eachDayOfInterval, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CategoryBudget, Transaction } from "@/types/firestore";

interface DailyCashPoint {
  day: string;
  balance: number;
  payables: number;
  receivables: number;
}

interface OverdraftAlert {
  firstNegativeDay: string;
  minimumBalance: number;
  projectedInterest: number;
  negativeDays: number;
  overdraftRate: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
  });
  const [forecast, setForecast] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
  });
  const [projected, setProjected] = useState({
    balance: 0,
  });
  const [monthlyData, setMonthlyData] = useState<
    Array<{ month: string; income: number; expenses: number }>
  >([]);
  const [dailyData, setDailyData] = useState<
    DailyCashPoint[]
  >([]);
  const [overdraftAlert, setOverdraftAlert] = useState<OverdraftAlert | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const currentPeriod = format(now, "yyyy-MM");

        const [transactionsSnap, budgetsSnap, profileResult] = await Promise.all([
          getDocs(query(collection(db, "transactions"), where("user_id", "==", user.uid))),
          getDocs(query(collection(db, "categoryBudgets"), where("user_id", "==", user.uid))),
          getUserProfile(user.uid),
        ]);

        const allTransactions = transactionsSnap.docs.map((item) => item.data() as Transaction);
        const allBudgets = budgetsSnap.docs.map((item) => item.data() as CategoryBudget);

        const monthTransactions = allTransactions.filter(
          (tx) => tx.date.slice(0, 7) === currentPeriod && tx.status !== "cancelled",
        );

        const income = monthTransactions
          .filter((tx) => tx.type === "income")
          .reduce((sum, tx) => sum + tx.amount, 0);
        const expenses = monthTransactions
          .filter((tx) => tx.type === "expense")
          .reduce((sum, tx) => sum + tx.amount, 0);

        setCurrentMonth({
          income,
          expenses,
          balance: income - expenses,
        });

        const monthBudgets = allBudgets.filter((item) => item.period === currentPeriod);
        const budgetIncome = monthBudgets
          .filter((item) => item.type === "income")
          .reduce((sum, item) => sum + item.budgeted_amount, 0);
        const budgetExpenses = monthBudgets
          .filter((item) => item.type === "expense")
          .reduce((sum, item) => sum + item.budgeted_amount, 0);
        const budgetBalance = budgetIncome - budgetExpenses;

        setForecast({
          income: budgetIncome,
          expenses: budgetExpenses,
          balance: budgetBalance,
        });
        setProjected({
          balance: budgetBalance,
        });

        const monthlyChartData = Array.from({ length: 6 }, (_, idx) => {
          const monthDate = subMonths(startOfMonth(now), 5 - idx);
          const monthKey = format(monthDate, "yyyy-MM");
          const monthTx = allTransactions.filter(
            (tx) => tx.date.slice(0, 7) === monthKey && tx.status !== "cancelled",
          );

          const monthIncome = monthTx
            .filter((tx) => tx.type === "income")
            .reduce((sum, tx) => sum + tx.amount, 0);
          const monthExpenses = monthTx
            .filter((tx) => tx.type === "expense")
            .reduce((sum, tx) => sum + tx.amount, 0);

          return {
            month: format(monthDate, "MMM", { locale: ptBR }),
            income: monthIncome,
            expenses: monthExpenses,
          };
        });
        setMonthlyData(monthlyChartData);

        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

        let runningBalance = 0;
        const dailyChartData: DailyCashPoint[] = days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayTxs = monthTransactions.filter((tx) => tx.date.slice(0, 10) === dayKey);

          const receivables = dayTxs
            .filter((tx) => tx.type === "income")
            .reduce((sum, tx) => sum + tx.amount, 0);

          const payables = dayTxs
            .filter((tx) => tx.type === "expense")
            .reduce((sum, tx) => sum + tx.amount, 0);

          runningBalance += receivables - payables;

          return {
            day: format(day, "dd"),
            balance: runningBalance,
            payables,
            receivables,
          };
        });

        setDailyData(dailyChartData);

        const overdraftRate = profileResult.success && profileResult.data
          ? profileResult.data.overdraft_rate
          : 8;

        let firstNegativeDay: string | null = null;
        let minimumBalance = 0;
        let projectedInterest = 0;
        let negativeDays = 0;

        for (const point of dailyChartData) {
          if (point.balance < 0) {
            negativeDays += 1;
            if (!firstNegativeDay) {
              firstNegativeDay = point.day;
            }
            minimumBalance = Math.min(minimumBalance, point.balance);
            projectedInterest += Math.abs(point.balance) * (overdraftRate / 100) / 30;
          }
        }

        if (negativeDays > 0 && firstNegativeDay) {
          setOverdraftAlert({
            firstNegativeDay,
            minimumBalance,
            projectedInterest,
            negativeDays,
            overdraftRate,
          });
        } else {
          setOverdraftAlert(null);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar dados do dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">
              Faça login para acessar
            </h2>
            <p className="mt-2 text-gray-600">
              Você precisa estar autenticado para visualizar o dashboard
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200"></div>
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-gray-100"></div>
          </div>

          <section>
            <div className="mb-3 h-4 w-40 animate-pulse rounded bg-gray-200"></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          </section>

          <section>
            <div className="mb-3 h-4 w-40 animate-pulse rounded bg-gray-200"></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          </section>

          <section>
            <ChartSkeleton />
            <div className="mt-6">
              <ChartSkeleton />
            </div>
          </section>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* 1ª Linha: Mês Corrente Realizado */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-600">
            Mês Corrente Realizado
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Receitas"
              value={`R$ ${currentMonth.income.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              variant="success"
              trend="up"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              title="Despesas"
              value={`R$ ${currentMonth.expenses.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              variant="danger"
              trend="down"
              icon={<TrendingDown className="h-5 w-5" />}
            />
            <StatCard
              title="Saldo Atual"
              value={`R$ ${currentMonth.balance.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              variant={currentMonth.balance >= 0 ? "success" : "danger"}
              icon={<Wallet className="h-5 w-5" />}
            />
          </div>
        </section>

        {/* 2ª Linha: Previsto do Mês */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-600">
            Previsto do Mês (Ainda Falta)
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Receitas Previstas"
              value={`R$ ${Math.max(0, forecast.income - currentMonth.income).toLocaleString(
                "pt-BR",
                {
                  minimumFractionDigits: 2,
                }
              )}`}
              subtitle="A receber"
              variant="primary"
              icon={<Calendar className="h-5 w-5" />}
            />
            <StatCard
              title="Despesas Previstas"
              value={`R$ ${Math.max(
                0,
                forecast.expenses - currentMonth.expenses
              ).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              subtitle="A pagar"
              variant="warning"
              icon={<Calendar className="h-5 w-5" />}
            />
            <StatCard
              title="Saldo Previsto"
              value={`R$ ${forecast.balance.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              subtitle="Estimativa"
              variant="primary"
              icon={<Target className="h-5 w-5" />}
            />
          </div>
        </section>

        {/* 3ª Linha: Diferença (Saldo Final Projetado) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-600">
            Projeção Final do Mês
          </h2>
          <div className="grid gap-4 sm:grid-cols-1">
            <StatCard
              title="Saldo Final Projetado"
              value={`R$ ${projected.balance.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`}
              subtitle="Incluindo todo o período"
              variant={projected.balance >= 0 ? "success" : "danger"}
              trend={projected.balance >= 0 ? "up" : "down"}
              icon={<Wallet className="h-6 w-6" />}
            />
          </div>
        </section>

        {overdraftAlert && (
          <section>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-red-100 p-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-red-800">
                    Alerta de Cheque Especial
                  </h2>
                  <p className="mt-1 text-sm text-red-700">
                    Seu saldo projetado fica negativo a partir do dia {overdraftAlert.firstNegativeDay}.
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-red-800 sm:grid-cols-3">
                    <div>
                      <p className="font-medium">Menor saldo</p>
                      <p>
                        R${" "}
                        {overdraftAlert.minimumBalance.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Dias no negativo</p>
                      <p>{overdraftAlert.negativeDays} dia(s)</p>
                    </div>
                    <div>
                      <p className="font-medium">Juros projetado</p>
                      <p>
                        R${" "}
                        {overdraftAlert.projectedInterest.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                        {" "}
                        <span className="text-xs text-red-700">
                          (taxa {overdraftAlert.overdraftRate}% a.m.)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Gráficos */}
        <section className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600">
            Análises
          </h2>
          <MonthlyComparisonChart data={monthlyData} />
          <DailyCashFlowChart data={dailyData} />
        </section>
      </div>
    </MainLayout>
  );
}
