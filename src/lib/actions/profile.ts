"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import type { User } from "@/types/firestore";

export async function updateUserProfile(
  userId: string,
  data: {
    name?: string;
    overdraftRate?: number;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();

    // Tentar buscar por documento ID
    const docRef = db.collection("users").doc(userId);
    const doc = await docRef.get();

    if (doc.exists) {
      const updates: Partial<User> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.overdraftRate !== undefined)
        updates.overdraft_rate = data.overdraftRate;

      await docRef.update(updates);
      revalidatePath("/");
      return { success: true };
    }

    // Se não existir, buscar por campo id
    const snapshot = await db
      .collection("users")
      .where("id", "==", userId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      const updates: Partial<User> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.overdraftRate !== undefined)
        updates.overdraft_rate = data.overdraftRate;

      await userDoc.ref.update(updates);
      revalidatePath("/");
      return { success: true };
    }

    // Se não existir, criar novo perfil
    const newUser: User = {
      id: userId,
      name: data.name || "Usuário",
      email: "",
      overdraft_rate: data.overdraftRate || 8,
    };

    await docRef.set(newUser);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar perfil",
    };
  }
}

export async function ensureUserProfile(
  userId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection("users").doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      const newUser: User = {
        id: userId,
        name: email.split("@")[0],
        email,
        overdraft_rate: 8,
      };
      await docRef.set(newUser);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar perfil",
    };
  }
}
