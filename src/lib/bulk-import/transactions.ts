import { parse } from "csv-parse/sync";
import { addMonths, isAfter, parse as parseDate, startOfDay } from "date-fns";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type {
  BulkImportResult,
  Category,
  CsvTransactionRow,
  Transaction,
  TransactionType,
} from "../../types/firestore";

const SUPPORTED_DATE_FORMATS = ["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"];

const RECURRING_KEYWORDS = ["mensal", "recorrente", "assinatura", "subscription"];

function parseTransactionDate(rawDate: string): Date {
  for (const format of SUPPORTED_DATE_FORMATS) {
    const parsed = parseDate(rawDate.trim(), format, new Date());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date(rawDate);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Data inválida no CSV: ${rawDate}`);
  }

  return fallback;
}

function parseMoney(rawValue: string): number {
  const normalized = rawValue.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);

  if (Number.isNaN(parsed)) {
    throw new Error(`Valor inválido no CSV: ${rawValue}`);
  }

  return parsed;
}

function inferType(value: number): TransactionType {
  return value < 0 ? "expense" : "income";
}

function shouldProject(description: string): boolean {
  const normalized = description.toLowerCase();
  return RECURRING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function getOrCreateCategory(
  db: Firestore,
  userId: string,
  name: string,
  type: TransactionType,
): Promise<{ id: string; created: boolean }> {
  const categoriesRef = db.collection("categories");
  const existing = await categoriesRef
    .where("user_id", "==", userId)
    .where("name", "==", name)
    .where("type", "==", type)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { id: existing.docs[0]!.id, created: false };
  }

  const doc = categoriesRef.doc();
  const payload: Category = {
    id: doc.id,
    user_id: userId,
    name,
    type,
    is_variable: true,
  };

  await doc.set(payload);
  return { id: doc.id, created: true };
}

function buildTransactionPayload(input: {
  userId: string;
  date: Date;
  description: string;
  amountRaw: number;
  categoryId: string;
  isRecurring: boolean;
  batchId: string;
  projectionOf?: string;
}): Omit<Transaction, "id"> {
  const type = inferType(input.amountRaw);
  const now = new Date().toISOString();
  const txDate = input.date.toISOString();

  return {
    user_id: input.userId,
    description: input.description,
    amount: Math.abs(input.amountRaw),
    date: txDate,
    category_id: input.categoryId,
    type,
    status: isAfter(startOfDay(input.date), startOfDay(new Date())) ? "scheduled" : "posted",
    payment_method: "cash",
    credit_card_id: null,
    is_recurring: input.isRecurring,
    installment_current: 1,
    installment_total: 1,
    projection_of: input.projectionOf ?? null,
    import_batch_id: input.batchId,
    created_at: now,
    updated_at: now,
  };
}

export async function importTransactionsFromCsv(options: {
  db: Firestore;
  userId: string;
  csvContent: string;
  projectionMonths?: number;
}): Promise<BulkImportResult> {
  const { db, userId, csvContent, projectionMonths = 3 } = options;

  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvTransactionRow[];

  const batchId = randomUUID();
  let importedCount = 0;
  let projectedCount = 0;
  let categoriesCreated = 0;

  for (const row of rows) {
    const txDate = parseTransactionDate(row.date);
    const amountRaw = parseMoney(row.value);
    const type = inferType(amountRaw);

    const { id: categoryId, created } = await getOrCreateCategory(
      db,
      userId,
      row.category,
      type,
    );

    if (created) {
      categoriesCreated += 1;
    }

    const transactionsRef = db.collection("transactions");
    const originDoc = transactionsRef.doc();
    const isRecurring = shouldProject(row.description);

    const originPayload: Transaction = {
      id: originDoc.id,
      ...buildTransactionPayload({
        userId,
        date: txDate,
        description: row.description,
        amountRaw,
        categoryId,
        isRecurring,
        batchId,
      }),
    };

    await originDoc.set(originPayload);
    importedCount += 1;

    if (!isRecurring) {
      continue;
    }

    for (let i = 1; i <= projectionMonths; i += 1) {
      const projectionDoc = transactionsRef.doc();
      const projectedDate = addMonths(txDate, i);

      const projectionPayload: Transaction = {
        id: projectionDoc.id,
        ...buildTransactionPayload({
          userId,
          date: projectedDate,
          description: `${row.description} (projeção ${i}/${projectionMonths})`,
          amountRaw,
          categoryId,
          isRecurring: true,
          batchId,
          projectionOf: originDoc.id,
        }),
      };

      await projectionDoc.set(projectionPayload);
      projectedCount += 1;
    }
  }

  return {
    importedCount,
    projectedCount,
    categoriesCreated,
    batchId,
  };
}
