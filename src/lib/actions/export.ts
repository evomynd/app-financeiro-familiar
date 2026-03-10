"use server";

import { getAdminDb } from "@/lib/firebase/admin";
import type { Transaction } from "@/types/firestore";

export async function exportTransactionsCsv(
  userId: string,
): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection("transactions")
      .where("user_id", "==", userId)
      .orderBy("date", "desc")
      .get();

    const transactions = snapshot.docs.map((doc) => doc.data() as Transaction);

    // Cabeçalho CSV
    const headers = [
      "Data",
      "Descrição",
      "Valor",
      "Tipo",
      "Status",
      "Categoria ID",
      "Método de Pagamento",
      "Cartão",
      "Recorrente",
      "Parcela",
      "Batch ID",
      "Criado em",
    ];

    // Linhas de dados
    const rows = transactions.map((tx) => [
      tx.date,
      `"${tx.description.replace(/"/g, '""')}"`, // Escape aspas
      tx.amount.toFixed(2),
      tx.type,
      tx.status,
      tx.category_id,
      tx.payment_method,
      tx.credit_card_id || "",
      tx.is_recurring ? "Sim" : "Não",
      tx.installment_total > 1
        ? `${tx.installment_current}/${tx.installment_total}`
        : "",
      tx.import_batch_id || "",
      tx.created_at || "",
    ]);

    // Montar CSV
    const csvLines = [headers.join(","), ...rows.map((row) => row.join(","))];
    const csv = csvLines.join("\n");

    return { success: true, csv };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao exportar transações",
    };
  }
}
