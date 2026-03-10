"use server";

import {
  startOfMonth,
  addMonths,
  parseISO,
  isBefore,
  isAfter,
  isSameMonth,
} from "date-fns";
import { getAdminDb } from "@/lib/firebase/admin";
import { Money } from "@/lib/utils/money";
import {
  calculateBillingMonth,
  getHistoricalRange,
} from "@/lib/utils/billing";
import type {
  Transaction,
  Category,
  CreditCard,
} from "@/types/firestore";

export interface MonthlyForecast {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  cumulativeBalance: number;
}

interface CategoryWithAverage extends Category {
  historicalAverage?: number;
}

interface TransactionProjection {
  date: Date;
  amount: number;
  description: string;
  categoryId: string;
  type: "income" | "expense";
  isRecurring: boolean;
  installmentInfo?: {
    current: number;
    total: number;
  };
}

/**
 * Motor de Previsão Financeira
 * 
 * Gera fluxo de caixa mensal para os próximos 12 meses considerando:
 * - Despesas parceladas alocadas nos meses exatos
 * - Despesas fixas recorrentes
 * - Média móvel dos últimos 6 meses para categorias variáveis
 * - Data de corte de cartão de crédito (transações após closing_day vão para próximo mês)
 */
export async function generateCashFlowForecast(
  userId: string,
  startMonth: Date = new Date(),
  monthsAhead: number = 12,
): Promise<{
  success: boolean;
  data?: MonthlyForecast[];
  error?: string;
}> {
  try {
    const db = getAdminDb();

    // 1. Buscar dados necessários
    const [categoriesSnap, cardsSnap, transactionsSnap] = await Promise.all([
      db.collection("categories").where("user_id", "==", userId).get(),
      db.collection("creditCards").where("user_id", "==", userId).get(),
      db.collection("transactions").where("user_id", "==", userId).get(),
    ]);

    const categories = categoriesSnap.docs.map((doc) => doc.data() as Category);
    const creditCards = cardsSnap.docs.map((doc) => doc.data() as CreditCard);
    const allTransactions = transactionsSnap.docs.map(
      (doc) => doc.data() as Transaction,
    );

    // 2. Calcular médias móveis para categorias variáveis
    const categoriesWithAverages = await calculateCategoryAverages(
      categories,
      allTransactions,
      startMonth,
    );

    // 3. Gerar projeções mensais
    const forecasts: MonthlyForecast[] = [];
    let cumulativeBalance = new Money(0);

    for (let i = 0; i < monthsAhead; i++) {
      const targetMonth = addMonths(startOfMonth(startMonth), i);

      // Projetar transações para este mês
      const projections = projectTransactionsForMonth(
        allTransactions,
        categoriesWithAverages,
        creditCards,
        targetMonth,
      );

      // Calcular saldo do mês
      const income = Money.sum(
        projections
          .filter((p) => p.type === "income")
          .map((p) => new Money(p.amount)),
      );

      const expenses = Money.sum(
        projections
          .filter((p) => p.type === "expense")
          .map((p) => new Money(p.amount)),
      );

      const balance = income.subtract(expenses);
      cumulativeBalance = cumulativeBalance.add(balance);

      forecasts.push({
        month: targetMonth.toISOString(),
        income: income.toNumber(),
        expenses: expenses.toNumber(),
        balance: balance.toNumber(),
        cumulativeBalance: cumulativeBalance.toNumber(),
      });
    }

    return { success: true, data: forecasts };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar previsão",
    };
  }
}

/**
 * Calcula média móvel dos últimos 6 meses para categorias variáveis
 */
async function calculateCategoryAverages(
  categories: Category[],
  transactions: Transaction[],
  referenceMonth: Date,
): Promise<CategoryWithAverage[]> {
  const { start, end } = getHistoricalRange(referenceMonth, 6);

  return categories.map((category) => {
    if (!category.is_variable) {
      return category;
    }

    // Filtrar transações históricas desta categoria
    const historicalTxs = transactions.filter((tx) => {
      const txDate = parseISO(tx.date);
      return (
        tx.category_id === category.id &&
        tx.status === "posted" &&
        !isBefore(txDate, start) &&
        !isAfter(txDate, end)
      );
    });

    if (historicalTxs.length === 0) {
      return { ...category, historicalAverage: 0 };
    }

    // Calcular média móvel
    const amounts = historicalTxs.map((tx) => new Money(tx.amount));
    const average = Money.average(amounts);

    return {
      ...category,
      historicalAverage: average.toNumber(),
    };
  });
}

/**
 * Projeta transações para um mês específico
 */
function projectTransactionsForMonth(
  allTransactions: Transaction[],
  categories: CategoryWithAverage[],
  creditCards: CreditCard[],
  targetMonth: Date,
): TransactionProjection[] {
  const projections: TransactionProjection[] = [];
  const monthStart = startOfMonth(targetMonth);
  const now = new Date();

  // Mapear cartões para acesso rápido
  const cardMap = new Map(creditCards.map((c) => [c.id, c]));

  // 1. Adicionar transações já lançadas/agendadas neste mês
  const scheduledTxs = allTransactions.filter((tx) => {
    const txDate = parseISO(tx.date);
    return isSameMonth(txDate, targetMonth) && tx.status !== "cancelled";
  });

  for (const tx of scheduledTxs) {
    const projectionDate = parseISO(tx.date);

    // Ajustar para mês de fatura se for cartão de crédito
    if (tx.payment_method === "credit_card" && tx.credit_card_id) {
      const card = cardMap.get(tx.credit_card_id);
      if (card) {
        const billingMonth = calculateBillingMonth(
          projectionDate,
          card.closing_day,
        );
        if (isSameMonth(billingMonth, targetMonth)) {
          projections.push({
            date: projectionDate,
            amount: tx.amount,
            description: tx.description,
            categoryId: tx.category_id,
            type: tx.type,
            isRecurring: tx.is_recurring,
            installmentInfo:
              tx.installment_total > 1
                ? {
                    current: tx.installment_current,
                    total: tx.installment_total,
                  }
                : undefined,
          });
        }
      }
    } else {
      projections.push({
        date: projectionDate,
        amount: tx.amount,
        description: tx.description,
        categoryId: tx.category_id,
        type: tx.type,
        isRecurring: tx.is_recurring,
        installmentInfo:
          tx.installment_total > 1
            ? {
                current: tx.installment_current,
                total: tx.installment_total,
              }
            : undefined,
      });
    }
  }

  // 2. Projetar despesas variáveis usando média móvel (apenas meses futuros)
  if (isAfter(targetMonth, now)) {
    const variableCategories = categories.filter(
      (c) => c.is_variable && c.historicalAverage && c.historicalAverage > 0,
    );

    for (const category of variableCategories) {
      // Verificar se já não existe transação programada para essa categoria
      const hasScheduled = projections.some(
        (p) => p.categoryId === category.id && !p.isRecurring,
      );

      if (!hasScheduled && category.historicalAverage) {
        projections.push({
          date: monthStart,
          amount: category.historicalAverage,
          description: `${category.name} (média móvel)`,
          categoryId: category.id,
          type: category.type,
          isRecurring: false,
        });
      }
    }
  }

  // 3. Projetar transações recorrentes fixas (apenas meses futuros)
  if (isAfter(targetMonth, now)) {
    const recurringTxs = allTransactions.filter(
      (tx) =>
        tx.is_recurring &&
        tx.status !== "cancelled" &&
        !isBefore(parseISO(tx.date), now),
    );

    const recurringByCategory = new Map<string, Transaction>();
    for (const tx of recurringTxs) {
      const existing = recurringByCategory.get(tx.category_id);
      if (
        !existing ||
        parseISO(tx.date) > parseISO(existing.date)
      ) {
        recurringByCategory.set(tx.category_id, tx);
      }
    }

    for (const [categoryId, tx] of recurringByCategory.entries()) {
      const category = categories.find((c) => c.id === categoryId);
      if (category && !category.is_variable) {
        // Verificar se já não foi projetada
        const alreadyProjected = projections.some(
          (p) => p.categoryId === categoryId && p.isRecurring,
        );

        if (!alreadyProjected) {
          projections.push({
            date: monthStart,
            amount: tx.amount,
            description: `${tx.description} (recorrente)`,
            categoryId: tx.category_id,
            type: tx.type,
            isRecurring: true,
          });
        }
      }
    }
  }

  return projections;
}

/**
 * Calcula previsão detalhada por categoria
 */
export async function getCategoryForecast(
  userId: string,
  categoryId: string,
  monthsAhead: number = 12,
): Promise<{
  success: boolean;
  data?: Array<{ month: string; amount: number }>;
  error?: string;
}> {
  try {
    const cashFlow = await generateCashFlowForecast(
      userId,
      new Date(),
      monthsAhead,
    );

    if (!cashFlow.success || !cashFlow.data) {
      return { success: false, error: cashFlow.error };
    }

    // TODO: Implementar detalhamento por categoria
    // Por enquanto retorna estrutura vazia
    return {
      success: true,
      data: cashFlow.data.map((cf) => ({
        month: cf.month,
        amount: 0,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar previsão",
    };
  }
}
