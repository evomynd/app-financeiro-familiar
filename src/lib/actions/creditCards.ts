"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CreditCard } from "@/types/firestore";

export async function createCreditCard(data: {
  userId: string;
  name: string;
  closingDay: number;
  dueDay: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = getAdminDb();
    const doc = db.collection("creditCards").doc();

    const card: CreditCard = {
      id: doc.id,
      user_id: data.userId,
      name: data.name,
      closing_day: data.closingDay,
      due_day: data.dueDay,
    };

    await doc.set(card);
    revalidatePath("/");

    return { success: true, id: doc.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function updateCreditCard(
  id: string,
  data: {
    name?: string;
    closingDay?: number;
    dueDay?: number;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const updates: Partial<CreditCard> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.closingDay !== undefined) updates.closing_day = data.closingDay;
    if (data.dueDay !== undefined) updates.due_day = data.dueDay;

    await db.collection("creditCards").doc(id).update(updates);
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function deleteCreditCard(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    await db.collection("creditCards").doc(id).delete();
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function getCreditCards(
  userId: string,
): Promise<{ success: boolean; data?: CreditCard[]; error?: string }> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection("creditCards")
      .where("user_id", "==", userId)
      .get();

    const cards = snapshot.docs.map((doc) => doc.data() as CreditCard);

    return { success: true, data: cards };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
