"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "@/types/firestore";

export async function createTransaction(data: {
  userId: string;
  description: string;
  amount: number;
  date: string;
  categoryId: string;
  type: TransactionType;
  status: TransactionStatus;
  paymentMethod: PaymentMethod;
  creditCardId?: string | null;
  isRecurring: boolean;
  installmentCurrent: number;
  installmentTotal: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = getAdminDb();
    const doc = db.collection("transactions").doc();

    const transaction: Transaction = {
      id: doc.id,
      user_id: data.userId,
      description: data.description,
      amount: data.amount,
      date: data.date,
      category_id: data.categoryId,
      type: data.type,
      status: data.status,
      payment_method: data.paymentMethod,
      credit_card_id: data.creditCardId ?? null,
      is_recurring: data.isRecurring,
      installment_current: data.installmentCurrent,
      installment_total: data.installmentTotal,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await doc.set(transaction);
    revalidatePath("/");

    return { success: true, id: doc.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function updateTransaction(
  id: string,
  data: Partial<{
    description: string;
    amount: number;
    date: string;
    categoryId: string;
    type: TransactionType;
    status: TransactionStatus;
    paymentMethod: PaymentMethod;
    creditCardId: string | null;
    isRecurring: boolean;
    installmentCurrent: number;
    installmentTotal: number;
  }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const updates: Partial<Transaction> = {
      updated_at: new Date().toISOString(),
    };

    if (data.description !== undefined) updates.description = data.description;
    if (data.amount !== undefined) updates.amount = data.amount;
    if (data.date !== undefined) updates.date = data.date;
    if (data.categoryId !== undefined) updates.category_id = data.categoryId;
    if (data.type !== undefined) updates.type = data.type;
    if (data.status !== undefined) updates.status = data.status;
    if (data.paymentMethod !== undefined) updates.payment_method = data.paymentMethod;
    if (data.creditCardId !== undefined) updates.credit_card_id = data.creditCardId;
    if (data.isRecurring !== undefined) updates.is_recurring = data.isRecurring;
    if (data.installmentCurrent !== undefined)
      updates.installment_current = data.installmentCurrent;
    if (data.installmentTotal !== undefined)
      updates.installment_total = data.installmentTotal;

    await db.collection("transactions").doc(id).update(updates);
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function deleteTransaction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    await db.collection("transactions").doc(id).delete();
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function getTransactions(
  userId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
  },
): Promise<{ success: boolean; data?: Transaction[]; error?: string }> {
  try {
    const db = getAdminDb();
    let query = db.collection("transactions").where("user_id", "==", userId);

    if (filters?.categoryId) {
      query = query.where("category_id", "==", filters.categoryId);
    }

    if (filters?.type) {
      query = query.where("type", "==", filters.type);
    }

    if (filters?.status) {
      query = query.where("status", "==", filters.status);
    }

    const snapshot = await query.get();
    let transactions = snapshot.docs.map((doc) => doc.data() as Transaction);

    if (filters?.startDate) {
      transactions = transactions.filter((t) => t.date >= filters.startDate!);
    }

    if (filters?.endDate) {
      transactions = transactions.filter((t) => t.date <= filters.endDate!);
    }

    return { success: true, data: transactions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function getTransactionById(
  id: string,
): Promise<{ success: boolean; data?: Transaction; error?: string }> {
  try {
    const db = getAdminDb();
    const doc = await db.collection("transactions").doc(id).get();

    if (!doc.exists) {
      return { success: false, error: "Transação não encontrada" };
    }

    return { success: true, data: doc.data() as Transaction };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
