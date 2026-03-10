"use server";

import { getAdminDb } from "@/lib/firebase/admin";
import type { User } from "@/types/firestore";

export async function getUserProfile(
  userId: string,
): Promise<{ success: boolean; data?: User; error?: string }> {
  try {
    const db = getAdminDb();

    const byId = await db.collection("users").doc(userId).get();
    if (byId.exists) {
      return { success: true, data: byId.data() as User };
    }

    const byField = await db
      .collection("users")
      .where("id", "==", userId)
      .limit(1)
      .get();

    if (!byField.empty) {
      return { success: true, data: byField.docs[0].data() as User };
    }

    return { success: false, error: "Perfil do usuário não encontrado." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar perfil.",
    };
  }
}
