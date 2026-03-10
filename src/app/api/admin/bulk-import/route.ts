import { NextRequest, NextResponse } from "next/server";
import { importTransactionsFromCsv } from "@/lib/bulk-import/transactions";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function isAllowedEnvironment() {
  return process.env.NODE_ENV === "development" || process.env.ALLOW_ADMIN_IMPORT === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const configuredKey = process.env.BULK_IMPORT_ADMIN_KEY;
  if (!configuredKey) {
    return true;
  }

  const receivedKey = request.headers.get("x-admin-import-key");
  return configuredKey === receivedKey;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAllowedEnvironment()) {
      return NextResponse.json(
        {
          error:
            "Rota disponível apenas em ambiente local/admin. Defina ALLOW_ADMIN_IMPORT=true para permitir explicitamente.",
        },
        { status: 403 },
      );
    }

    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const userId = formData.get("userId")?.toString();
    const projectionMonthsRaw = formData.get("projectionMonths")?.toString();

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo CSV no campo 'file'." }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Campo 'userId' é obrigatório." }, { status: 400 });
    }

    const csvContent = await file.text();
    const projectionMonths = projectionMonthsRaw ? Number(projectionMonthsRaw) : 3;

    const result = await importTransactionsFromCsv({
      db: getAdminDb(),
      userId,
      csvContent,
      projectionMonths,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no bulk import.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
