import { startOfMonth, endOfMonth, addMonths, getDate } from "date-fns";

export interface CreditCardBillingInfo {
  closingDay: number;
  dueDay: number;
}

/**
 * Calcula qual mês de fatura uma transação de cartão pertence
 * baseado na data da transação e no dia de fechamento do cartão.
 */
export function calculateBillingMonth(
  transactionDate: Date,
  closingDay: number,
): Date {
  const txDay = getDate(transactionDate);
  const txMonth = startOfMonth(transactionDate);

  if (txDay <= closingDay) {
    return txMonth;
  }

  return addMonths(txMonth, 1);
}

/**
 * Gera as parcelas de uma transação parcelada distribuindo
 * pelos meses subsequentes.
 */
export function generateInstallments(
  baseTransaction: {
    date: Date;
    amount: number;
    description: string;
  },
  installmentTotal: number,
  creditCardClosingDay?: number,
): Array<{
  date: Date;
  amount: number;
  description: string;
  installmentCurrent: number;
  billingMonth?: Date;
}> {
  const installmentAmount = baseTransaction.amount / installmentTotal;
  const installments: Array<{
    date: Date;
    amount: number;
    description: string;
    installmentCurrent: number;
    billingMonth?: Date;
  }> = [];

  for (let i = 0; i < installmentTotal; i++) {
    const installmentDate = addMonths(baseTransaction.date, i);
    let billingMonth: Date | undefined;

    if (creditCardClosingDay !== undefined) {
      billingMonth = calculateBillingMonth(installmentDate, creditCardClosingDay);
    }

    installments.push({
      date: installmentDate,
      amount: installmentAmount,
      description: `${baseTransaction.description} (${i + 1}/${installmentTotal})`,
      installmentCurrent: i + 1,
      billingMonth,
    });
  }

  return installments;
}

/**
 * Retorna range de datas para buscar transações históricas
 * para cálculo de média móvel.
 */
export function getHistoricalRange(
  referenceMonth: Date,
  monthsBack: number,
): { start: Date; end: Date } {
  const end = endOfMonth(addMonths(referenceMonth, -1));
  const start = startOfMonth(addMonths(end, -monthsBack + 1));

  return { start, end };
}
