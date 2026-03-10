"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Category, CategoryType } from "@/types/firestore";

export async function createCategory(data: {
  userId: string;
  name: string;
  type: CategoryType;
  isVariable: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = getAdminDb();
    const doc = db.collection("categories").doc();

    const category: Category = {
      id: doc.id,
      user_id: data.userId,
      name: data.name,
      type: data.type,
      is_variable: data.isVariable,
    };

    await doc.set(category);
    revalidatePath("/");

    return { success: true, id: doc.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function updateCategory(
  id: string,
  data: {
    name?: string;
    type?: CategoryType;
    isVariable?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const updates: Partial<Category> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.isVariable !== undefined) updates.is_variable = data.isVariable;

    await db.collection("categories").doc(id).update(updates);
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function deleteCategory(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    await db.collection("categories").doc(id).delete();
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function getCategories(
  userId: string,
): Promise<{ success: boolean; data?: Category[]; error?: string }> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection("categories")
      .where("user_id", "==", userId)
      .get();

    const categories = snapshot.docs.map((doc) => doc.data() as Category);

    return { success: true, data: categories };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
