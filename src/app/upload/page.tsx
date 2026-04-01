"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CreditCard, PaymentMethod, Transaction } from "@/types/firestore";

interface ParsedInvoiceRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestedCategory: string;
  keepSuggestedCategory: boolean;
  customCategoryName: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  creditCardId: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: "income" | "expense";
}

interface CreditCardOption {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
}

type InvoicePaymentType = "credit_card" | "cash";

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "pix", label: "PIX" },
  { value: "debit", label: "Débito" },
  { value: "cash", label: "Dinheiro" },
  { value: "bank_transfer", label: "Transferência" },
];

export default function UploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedInvoiceRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCardOption[]>([]);
  const [invoicePaymentType, setInvoicePaymentType] = useState<InvoicePaymentType>("credit_card");
  const [selectedInvoiceCardId, setSelectedInvoiceCardId] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [aiProvider, setAiProvider] = useState("");

  const expenseCategories = useMemo(
    () => categories.filter((cat) => cat.type === "expense"),
    [categories],
  );

  useEffect(() => {
    if (!user) return;

    const loadReferenceData = async () => {
      const categoriesQuery = query(collection(db, "categories"), where("user_id", "==", user.uid));
      const cardsQuery = query(collection(db, "creditCards"), where("user_id", "==", user.uid));

      const [categoriesSnapshot, cardsSnapshot] = await Promise.all([
        getDocs(categoriesQuery),
        getDocs(cardsQuery),
      ]);

      const categoryData = categoriesSnapshot.docs
        .map((item) => {
          const raw = item.data() as Partial<CategoryOption>;
          return {
            id: raw.id ?? item.id,
            name: raw.name ?? "",
            type: raw.type === "income" ? "income" : "expense",
          } as CategoryOption;
        })
        .filter((cat) => Boolean(cat.name));

      const cardData = cardsSnapshot.docs
        .map((item) => {
          const raw = item.data() as Partial<CreditCard>;
          return {
            id: raw.id ?? item.id,
            name: raw.name ?? "",
            closing_day: raw.closing_day ?? 1,
            due_day: raw.due_day ?? 1,
          } as CreditCardOption;
        })
        .filter((card) => Boolean(card.name));

      setCategories(categoryData);
      setCreditCards(cardData);
      if (cardData.length === 1) {
        setSelectedInvoiceCardId(cardData[0]!.id);
      }
    };

    loadReferenceData().catch((err) => {
      console.error(err);
      setError("Não foi possível carregar categorias e cartões.");
    });
  }, [user]);

  const findCategoryIdByName = (name: string) => {
    const normalized = name.trim().toLowerCase();
    const match = expenseCategories.find(
      (cat) => cat.name.trim().toLowerCase() === normalized,
    );
    return match?.id ?? "";
  };

  const handleSmartUpload = async () => {
    if (!file) {
      setError("Selecione um arquivo CSV.");
      return;
    }

    if (invoicePaymentType === "credit_card" && !selectedInvoiceCardId) {
      setError("Selecione qual cartão será usado antes de processar a fatura.");
      return;
    }

    setLoadingAi(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ai/invoice-parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        let errorMsg = payload.error ?? "Falha ao processar CSV com IA.";
        if (payload.details) {
          const details = payload.details as { gemini?: string; groq?: string };
          errorMsg += `\n• Gemini: ${details.gemini ?? "sem erro"}\n• Groq: ${details.groq ?? "sem erro"}`;
        }
        throw new Error(errorMsg);
      }

      const defaultCreditCardId =
        invoicePaymentType === "credit_card"
          ? selectedInvoiceCardId || (creditCards.length === 1 ? creditCards[0]?.id ?? "" : "")
          : "";

      const parsedRows: ParsedInvoiceRow[] = payload.data.map(
        (item: {
          date: string;
          description: string;
          amount: number;
          suggested_category: string;
        },
        index: number,
      ) => ({
        id: `${index}-${item.date}-${item.description}`,
        date: item.date,
        description: item.description,
        amount: Math.abs(Number(item.amount)),
        suggestedCategory: item.suggested_category,
        keepSuggestedCategory: true,
        customCategoryName: item.suggested_category,
        categoryId: findCategoryIdByName(item.suggested_category),
        paymentMethod: invoicePaymentType === "credit_card" ? "credit_card" : "debit",
        creditCardId: defaultCreditCardId,
      }),
      );

      setRows(parsedRows);
      setSuccess(`${parsedRows.length} lançamento(s) extraído(s) pela IA.`);
      setAiProvider(payload.provider || "IA");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload inteligente.");
    } finally {
      setLoadingAi(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ParsedInvoiceRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleApproveBatch = async () => {
    if (!user) {
      setError("Faça login para aprovar o lote.");
      return;
    }

    if (rows.length === 0) {
      setError("Não há dados para aprovar.");
      return;
    }

    const hasMissingCategory = rows.some((row) => {
      const desiredCategoryName = (
        row.keepSuggestedCategory ? row.suggestedCategory : row.customCategoryName
      ).trim();

      if (!desiredCategoryName) return true;

      const existingCategoryId = row.categoryId || findCategoryIdByName(desiredCategoryName);
      return !existingCategoryId;
    });

    if (hasMissingCategory && !autoCreateCategories) {
      setError("Revise a categoria final de todos os lançamentos ou ative a criação automática.");
      return;
    }

    const hasCreditWithoutCard = rows.some(
      (row) => row.paymentMethod === "credit_card" && !row.creditCardId,
    );

    if (hasCreditWithoutCard) {
      setError("Selecione o cartão de crédito para todos os lançamentos com método Cartão de Crédito.");
      return;
    }

    setApproving(true);
    setError("");
    setSuccess("");

    try {
      const batch = writeBatch(db);
      const batchId = `ai-${Date.now()}`;
      const now = new Date().toISOString();
      let categoriesCreated = 0;
      const createdCategoryIds = new Map<string, string>();

      // Criar categorias que não existem (se autoCreateCategories estiver ativo)
      if (autoCreateCategories) {
        for (const row of rows) {
          const desiredCategoryName = (
            row.keepSuggestedCategory ? row.suggestedCategory : row.customCategoryName
          ).trim();

          if (!desiredCategoryName) {
            continue;
          }

          const existingCategoryId = row.categoryId || findCategoryIdByName(desiredCategoryName);
          if (!existingCategoryId) {
            const normalized = desiredCategoryName.toLowerCase();
            
            // Verificar se já criamos essa categoria neste lote
            if (!createdCategoryIds.has(normalized)) {
              const categoryRef = doc(collection(db, "categories"));
              const newCategory = {
                id: categoryRef.id,
                user_id: user.uid,
                name: desiredCategoryName,
                type: "expense" as const,
                is_variable: true,
              };
              
              batch.set(categoryRef, newCategory);
              createdCategoryIds.set(normalized, categoryRef.id);
              categoriesCreated++;
              
              // Atualizar categoria local para uso imediato
              setCategories((prev) => [...prev, newCategory]);
            }
          }
        }
      }

      for (const row of rows) {
        const ref = doc(collection(db, "transactions"));

        const desiredCategoryName = (
          row.keepSuggestedCategory ? row.suggestedCategory : row.customCategoryName
        ).trim();

        if (!desiredCategoryName) {
          throw new Error(`Defina a categoria final para: ${row.description}`);
        }
        
        // Usar categoria criada automaticamente se necessário
        let finalCategoryId = row.categoryId || findCategoryIdByName(desiredCategoryName);
        if (!finalCategoryId && autoCreateCategories) {
          const normalized = desiredCategoryName.toLowerCase();
          finalCategoryId = createdCategoryIds.get(normalized) ?? "";
        }
        
        if (!finalCategoryId) {
          throw new Error(`Categoria não encontrada para: ${row.description}`);
        }

        const transaction: Transaction = {
          id: ref.id,
          user_id: user.uid,
          description: row.description,
          amount: row.amount,
          date: row.date,
          category_id: finalCategoryId,
          type: "expense",
          status: "posted",
          payment_method: row.paymentMethod,
          credit_card_id: row.paymentMethod === "credit_card" ? row.creditCardId : null,
          is_recurring: false,
          installment_current: 1,
          installment_total: 1,
          projection_of: null,
          import_batch_id: batchId,
          created_at: now,
          updated_at: now,
        };

        batch.set(ref, transaction);
      }

      await batch.commit();
      
      let successMsg = `Lote aprovado com sucesso! ${rows.length} lançamentos salvos.`;
      if (categoriesCreated > 0) {
        successMsg += ` ${categoriesCreated} categoria(s) criada(s) automaticamente.`;
      }
      
      setSuccess(successMsg);
      setRows([]);
      setFile(null);
      setAiProvider("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar lote.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Inteligente de Fatura</h1>
          <p className="mt-1 text-sm text-gray-600">
            Envie o CSV, revise o que a IA extraiu e aprove o lote com segurança.
          </p>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">Tipo da fatura</label>
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <input
                    type="radio"
                    name="invoicePaymentType"
                    value="credit_card"
                    checked={invoicePaymentType === "credit_card"}
                    onChange={() => setInvoicePaymentType("credit_card")}
                    className="h-4 w-4 border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  Cartão de crédito
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <input
                    type="radio"
                    name="invoicePaymentType"
                    value="cash"
                    checked={invoicePaymentType === "cash"}
                    onChange={() => setInvoicePaymentType("cash")}
                    className="h-4 w-4 border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  Pagamento à vista
                </label>
              </div>
            </div>
          </div>

          {invoicePaymentType === "credit_card" && (
            <div className="mt-4 max-w-sm">
              <label className="mb-2 block text-sm font-medium text-gray-700">Cartão da fatura</label>
              <select
                value={selectedInvoiceCardId}
                onChange={(e) => setSelectedInvoiceCardId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Selecione o cartão</option>
                {creditCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">Arquivo CSV da fatura</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <button
              type="button"
              onClick={handleSmartUpload}
              disabled={loadingAi}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadIcon className="h-4 w-4" />
              {loadingAi ? "Processando com IA..." : "Processar com IA"}
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <p className="whitespace-pre-line">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>
                <p>{success}</p>
                {aiProvider && (
                  <p className="mt-1 text-xs text-green-600">
                    Provider: <span className="font-semibold">{aiProvider}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoCreateCategories}
                  onChange={(e) => setAutoCreateCategories(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Criar categorias automaticamente se não existirem
                </span>
              </label>
            </div>
          )}
        </section>

        {rows.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Revisão Human-in-the-loop</h2>
            </div>

            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="px-2 py-2 whitespace-nowrap">Data</th>
                    <th className="px-2 py-2 whitespace-nowrap">Descrição</th>
                    <th className="px-2 py-2 whitespace-nowrap">Valor (R$)</th>
                    <th className="px-2 py-2 whitespace-nowrap">Categoria sugerida (IA)</th>
                    <th className="px-2 py-2 whitespace-nowrap">Categoria final</th>
                    <th className="px-2 py-2 whitespace-nowrap">Método de pagamento</th>
                    <th className="px-2 py-2 whitespace-nowrap">Cartão</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 align-top">
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.id, { date: e.target.value })}
                          className="rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateRow(row.id, { description: e.target.value })}
                          className="w-64 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={(e) =>
                            updateRow(row.id, { amount: Math.abs(Number(e.target.value || 0)) })
                          }
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-800 font-medium">{row.suggestedCategory}</td>
                      <td className="px-2 py-2">
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                            <input
                              type="checkbox"
                              checked={row.keepSuggestedCategory}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  keepSuggestedCategory: e.target.checked,
                                  customCategoryName: e.target.checked
                                    ? row.suggestedCategory
                                    : row.customCategoryName,
                                  categoryId: e.target.checked
                                    ? findCategoryIdByName(row.suggestedCategory)
                                    : row.categoryId,
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            />
                            Manter sugestão da IA
                          </label>

                          {!row.keepSuggestedCategory && (
                            <div className="space-y-2">
                              <select
                                value={row.categoryId}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const selected = expenseCategories.find((cat) => cat.id === selectedId);
                                  updateRow(row.id, {
                                    categoryId: selectedId,
                                    customCategoryName: selected?.name ?? row.customCategoryName,
                                  });
                                }}
                                className="w-52 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                              >
                                <option value="">Escolher da lista</option>
                                {expenseCategories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>

                              <input
                                type="text"
                                value={row.customCategoryName}
                                onChange={(e) => {
                                  const customName = e.target.value;
                                  updateRow(row.id, {
                                    customCategoryName: customName,
                                    categoryId: findCategoryIdByName(customName),
                                  });
                                }}
                                placeholder="Ou digitar nova categoria"
                                className="w-52 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.paymentMethod}
                          onChange={(e) =>
                            updateRow(row.id, {
                              paymentMethod: e.target.value as PaymentMethod,
                              creditCardId:
                                e.target.value === "credit_card"
                                  ? row.creditCardId
                                  : "",
                            })
                          }
                          className="w-44 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                        >
                          {paymentMethods.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {row.paymentMethod === "credit_card" ? (
                          <select
                            value={row.creditCardId}
                            onChange={(e) => updateRow(row.id, { creditCardId: e.target.value })}
                            className="w-52 rounded border border-gray-300 px-2 py-1 text-gray-900 font-medium"
                          >
                            <option value="">Selecione o cartão</option>
                            {creditCards.map((card) => (
                              <option key={card.id} value={card.id}>
                                {card.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-500">Não se aplica</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </div>
            </div>

            {creditCards.length === 0 && rows.some((row) => row.paymentMethod === "credit_card") && (
              <p className="mt-3 text-sm text-amber-700">
                Nenhum cartão cadastrado. Vá em Configurações e adicione ao menos um cartão para vincular as despesas do upload.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleApproveBatch}
                disabled={approving}
                className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approving ? "Aprovando lote..." : "Aprovar Lote"}
              </button>
            </div>
          </section>
        )}

        {!user && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
            Faça login para usar o upload inteligente de fatura.
          </div>
        )}
      </div>
    </MainLayout>
  );
}
