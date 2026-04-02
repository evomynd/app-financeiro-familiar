"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertCircle,
  ArrowDown,
  ArrowUpDown,
  ArrowUp,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Category, CategoryBudget, CreditCard, Transaction, TransactionType } from "@/types/firestore";

type BudgetSortField = "category" | "budget" | "realized" | "difference";
type BudgetSortDirection = "asc" | "desc";

const monthOptions = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
] as const;

const now = new Date();
const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i);
const brlFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatCurrencyBr = (value: number) => `R$ ${brlFormatter.format(value)}`;

export default function OrcamentoPage() {
  const { user } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);

  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingCategoryName, setSavingCategoryName] = useState(false);
  const [addingType, setAddingType] = useState<TransactionType | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [creatingCategoryRow, setCreatingCategoryRow] = useState(false);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const [copyingBudgets, setCopyingBudgets] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [copyFromMonth, setCopyFromMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [copyFromYear, setCopyFromYear] = useState(
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
  );
  const [sortByType, setSortByType] = useState<
    Record<TransactionType, { field: BudgetSortField; direction: BudgetSortDirection }>
  >({
    income: { field: "realized", direction: "desc" },
    expense: { field: "realized", direction: "desc" },
  });

  const period = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const copySourcePeriod = `${copyFromYear}-${String(copyFromMonth).padStart(2, "0")}`;

  const loadData = async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError("");

    try {
      const categoriesQuery = query(
        collection(db, "categories"),
        where("user_id", "==", user.uid),
      );
      const transactionsQuery = query(
        collection(db, "transactions"),
        where("user_id", "==", user.uid),
      );
      const budgetsQuery = query(
        collection(db, "categoryBudgets"),
        where("user_id", "==", user.uid),
      );
      const creditCardsQuery = query(
        collection(db, "creditCards"),
        where("user_id", "==", user.uid),
      );

      const [categoriesSnap, transactionsSnap, budgetsSnap, creditCardsSnap] = await Promise.all([
        getDocs(categoriesQuery),
        getDocs(transactionsQuery),
        getDocs(budgetsQuery),
        getDocs(creditCardsQuery),
      ]);

      const categoryList = categoriesSnap.docs
        .map((d) => d.data() as Category)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      const txList = transactionsSnap.docs.map((d) => d.data() as Transaction);
      const budgetList = budgetsSnap.docs
        .map((d) => d.data() as CategoryBudget)
        .filter((item) => item.period === period);
      const cardList = creditCardsSnap.docs.map((d) => d.data() as CreditCard);

      setCategories(categoryList);
      setTransactions(txList);
      setBudgets(budgetList);
      setCreditCards(cardList);
      setEditingRowKey(null);
      setEditingBudgetValue("");
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar orçamento e realizado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    loadData();
  }, [user?.uid, period]);

  const creditCardMap = useMemo(
    () => new Map(creditCards.map((c) => [c.id, c])),
    [creditCards],
  );

  // Returns the billing period for a transaction.
  // Credit card purchases after the closing day are billed in the following month.
  const getBillingPeriod = (tx: Transaction): string => {
    if (tx.payment_method === "credit_card" && tx.credit_card_id) {
      const card = creditCardMap.get(tx.credit_card_id);
      if (card) {
        const [year, month, day] = tx.date.slice(0, 10).split("-").map(Number);
        if (day > card.closing_day) {
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;
          return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
        }
      }
    }
    return tx.date.slice(0, 7);
  };

  const transactionsInPeriod = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.status !== "cancelled" && getBillingPeriod(tx) === period,
      ),
    [transactions, period, creditCardMap],
  );

  const incomeCategories = useMemo(() => {
    const categoryIdsWithBudget = new Set(budgets.map((b) => b.category_id));
    const categoryIdsWithTx = new Set(
      transactionsInPeriod.filter((tx) => tx.type === "income").map((tx) => tx.category_id),
    );
    return categories.filter(
      (cat) => cat.type === "income" && (categoryIdsWithBudget.has(cat.id) || categoryIdsWithTx.has(cat.id)),
    );
  }, [categories, budgets, transactionsInPeriod]);

  const expenseCategories = useMemo(() => {
    const categoryIdsWithBudget = new Set(budgets.map((b) => b.category_id));
    const categoryIdsWithTx = new Set(
      transactionsInPeriod.filter((tx) => tx.type === "expense").map((tx) => tx.category_id),
    );
    return categories.filter(
      (cat) => cat.type === "expense" && (categoryIdsWithBudget.has(cat.id) || categoryIdsWithTx.has(cat.id)),
    );
  }, [categories, budgets, transactionsInPeriod]);

  const getBudgetByCategory = (categoryId: string) => {
    const item = budgets.find((b) => b.category_id === categoryId);
    return item?.budgeted_amount ?? 0;
  };

  const getRealizedByCategory = (categoryId: string, type: TransactionType) =>
    transactionsInPeriod
      .filter((tx) => tx.category_id === categoryId && tx.type === type)
      .reduce((sum, tx) => sum + tx.amount, 0);

  const budgetTotals = useMemo(() => {
    // Soma orçado direto dos budgets do período (independente do filtro de categorias visíveis)
    const incomeBudget = budgets
      .filter((b) => b.type === "income")
      .reduce((sum, b) => sum + b.budgeted_amount, 0);

    const expenseBudget = budgets
      .filter((b) => b.type === "expense")
      .reduce((sum, b) => sum + b.budgeted_amount, 0);

    const incomeRealized = transactionsInPeriod
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenseRealized = transactionsInPeriod
      .filter((tx) => tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      incomeBudget,
      expenseBudget,
      resultBudget: incomeBudget - expenseBudget,
      incomeRealized,
      expenseRealized,
      resultRealized: incomeRealized - expenseRealized,
    };
  }, [budgets, transactionsInPeriod]);

  const startBudgetEdit = (categoryId: string, type: TransactionType) => {
    const rowKey = `${type}:${categoryId}`;
    setEditingRowKey(rowKey);
    setEditingBudgetValue(String(getBudgetByCategory(categoryId)));
  };

  const saveBudgetEdit = async (categoryId: string, type: TransactionType) => {
    if (!user?.uid) return;

    const value = Math.abs(Number(editingBudgetValue));
    if (!Number.isFinite(value)) {
      setError("Valor de orçamento inválido.");
      return;
    }

    setSavingBudget(true);
    setError("");
    setSuccess("");

    try {
      const nowIso = new Date().toISOString();
      const existing = budgets.find((b) => b.category_id === categoryId);
      const ref = existing
        ? doc(db, "categoryBudgets", existing.id)
        : doc(collection(db, "categoryBudgets"));

      const payload: CategoryBudget = {
        id: ref.id,
        user_id: user.uid,
        period,
        year: selectedYear,
        month: selectedMonth,
        category_id: categoryId,
        type,
        budgeted_amount: value,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      };

      await setDoc(ref, payload);

      setBudgets((prev) => {
        const idx = prev.findIndex((b) => b.id === payload.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = payload;
          return copy;
        }
        return [...prev, payload];
      });

      setEditingRowKey(null);
      setEditingBudgetValue("");
      setSuccess("Orçamento salvo com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro ao salvar orçamento.");
    } finally {
      setSavingBudget(false);
    }
  };

  const toggleSortType = (type: TransactionType, field: BudgetSortField) => {
    setSortByType((prev) => ({
      ...prev,
      [type]:
        prev[type].field === field
          ? {
              field,
              direction: prev[type].direction === "asc" ? "desc" : "asc",
            }
          : {
              field,
              direction: "asc",
            },
    }));
  };

  const renderSortIcon = (type: TransactionType, field: BudgetSortField) => {
    const current = sortByType[type];

    if (current.field !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    }

    return current.direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-orange-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-orange-600" />
    );
  };

  const saveNewCategoryRow = async (type: TransactionType) => {
    if (!user?.uid) return;

    const trimmedName = newCategoryName.trim();
    const budgetValue = Math.abs(Number(newCategoryBudget || "0"));

    if (!trimmedName) {
      setError("Digite o nome da categoria para incluir nova receita/despesa.");
      return;
    }

    if (!Number.isFinite(budgetValue)) {
      setError("Valor de orçamento inválido para nova categoria.");
      return;
    }

    setCreatingCategoryRow(true);
    setError("");
    setSuccess("");

    try {
      const nowIso = new Date().toISOString();
      const normalized = trimmedName.toLocaleLowerCase("pt-BR").trim();

      const existingCategory = categories.find(
        (cat) => cat.type === type && cat.name.toLocaleLowerCase("pt-BR").trim() === normalized,
      );

      let categoryId = existingCategory?.id;
      let createdCategory: Category | null = null;

      if (!categoryId) {
        const categoryRef = doc(collection(db, "categories"));
        createdCategory = {
          id: categoryRef.id,
          user_id: user.uid,
          name: trimmedName,
          type,
          is_variable: true,
        };

        await setDoc(categoryRef, createdCategory);
        categoryId = createdCategory.id;
      }

      const existingBudget = budgets.find((b) => b.category_id === categoryId);
      const budgetRef = existingBudget
        ? doc(db, "categoryBudgets", existingBudget.id)
        : doc(collection(db, "categoryBudgets"));

      const budgetPayload: CategoryBudget = {
        id: budgetRef.id,
        user_id: user.uid,
        period,
        year: selectedYear,
        month: selectedMonth,
        category_id: categoryId,
        type,
        budgeted_amount: budgetValue,
        created_at: existingBudget?.created_at ?? nowIso,
        updated_at: nowIso,
      };

      await setDoc(budgetRef, budgetPayload);

      if (createdCategory) {
        setCategories((prev) => [...prev, createdCategory!].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      }

      setBudgets((prev) => {
        const idx = prev.findIndex((b) => b.id === budgetPayload.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = budgetPayload;
          return copy;
        }
        return [...prev, budgetPayload];
      });

      setAddingType(null);
      setNewCategoryName("");
      setNewCategoryBudget("");
      setSuccess(`${type === "income" ? "Receita" : "Despesa"} adicionada com sucesso.`);
    } catch (err) {
      console.error(err);
      setError("Erro ao adicionar nova categoria no orçamento.");
    } finally {
      setCreatingCategoryRow(false);
    }
  };

  const startCategoryRename = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const saveCategoryRename = async (categoryId: string) => {
    if (!user?.uid) return;
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;

    setSavingCategoryName(true);
    setError("");
    setSuccess("");

    try {
      const ref = doc(db, "categories", categoryId);
      await setDoc(ref, { name: trimmed }, { merge: true });
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: trimmed } : c)),
      );
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setSuccess("Nome da categoria atualizado.");
    } catch (err) {
      console.error(err);
      setError("Erro ao renomear categoria.");
    } finally {
      setSavingCategoryName(false);
    }
  };

  const deleteCategory = async (categoryId: string, type: TransactionType) => {
    if (!user?.uid) return;
    if (!confirm(`Deseja remover esta ${type === "income" ? "receita" : "despesa"} do orçamento? A categoria e seus lançamentos não serão apagados.`)) return;

    setError("");
    setSuccess("");

    try {
      const existingBudget = budgets.find((b) => b.category_id === categoryId);
      if (existingBudget) {
        await deleteDoc(doc(db, "categoryBudgets", existingBudget.id));
        setBudgets((prev) => prev.filter((b) => b.id !== existingBudget.id));
      }
      // Remove a categoria localmente para sumir da tabela deste mês
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      setSuccess(`${type === "income" ? "Receita" : "Despesa"} removida do orçamento.`);
    } catch (err) {
      console.error(err);
      setError("Erro ao remover do orçamento.");
    }
  };

  const deleteAllPeriod = async () => {
    if (!user?.uid) return;
    setDeletingAll(true);
    setError("");
    setSuccess("");
    try {
      const batch = writeBatch(db);
      // Apaga todos os orçamentos do período
      for (const b of budgets) {
        batch.delete(doc(db, "categoryBudgets", b.id));
      }
      // Apaga todos os lançamentos do período
      const txIds = transactionsInPeriod.map((tx) => tx.id);
      for (const id of txIds) {
        batch.delete(doc(db, "transactions", id));
      }
      await batch.commit();
      setBudgets([]);
      setTransactions((prev) => prev.filter((tx) => !txIds.includes(tx.id)));
      setShowDeleteAllModal(false);
      setSuccess(`Todos os lançamentos e orçamentos de ${period} foram apagados.`);
    } catch (err) {
      console.error(err);
      setError("Erro ao apagar os dados do período.");
    } finally {
      setDeletingAll(false);
    }
  };

  const copyBudgetsFromAnotherPeriod = async () => {
    if (!user?.uid) return;

    if (copySourcePeriod === period) {
      setError("Selecione um período de origem diferente do período atual.");
      return;
    }

    setCopyingBudgets(true);
    setError("");
    setSuccess("");

    try {
      const budgetsQuery = query(
        collection(db, "categoryBudgets"),
        where("user_id", "==", user.uid),
      );
      const budgetsSnap = await getDocs(budgetsQuery);
      const allBudgets = budgetsSnap.docs.map((d) => d.data() as CategoryBudget);

      const sourceBudgets = allBudgets.filter((b) => b.period === copySourcePeriod);
      if (sourceBudgets.length === 0) {
        setError("Não há valores orçados no período de origem selecionado.");
        return;
      }

      const targetBudgets = allBudgets.filter((b) => b.period === period);
      const targetByCategory = new Map(targetBudgets.map((b) => [b.category_id, b]));

      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      const upserts: CategoryBudget[] = [];

      for (const source of sourceBudgets) {
        const existingTarget = targetByCategory.get(source.category_id);
        const ref = existingTarget
          ? doc(db, "categoryBudgets", existingTarget.id)
          : doc(collection(db, "categoryBudgets"));

        const payload: CategoryBudget = {
          id: ref.id,
          user_id: user.uid,
          period,
          year: selectedYear,
          month: selectedMonth,
          category_id: source.category_id,
          type: source.type,
          budgeted_amount: source.budgeted_amount,
          created_at: existingTarget?.created_at ?? nowIso,
          updated_at: nowIso,
        };

        batch.set(ref, payload);
        upserts.push(payload);
      }

      await batch.commit();

      setBudgets((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item]));
        for (const item of upserts) {
          byId.set(item.id, item);
        }
        return Array.from(byId.values()).filter((item) => item.period === period);
      });

      setCopyPanelOpen(false);
      setSuccess(`${upserts.length} valor(es) orçados copiados de ${copySourcePeriod} para ${period}.`);
      // Recarrega os dados para exibir o realizado correto do período atual
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao copiar valores orçados de outro período.");
    } finally {
      setCopyingBudgets(false);
    }
  };

  const renderBlock = (title: string, blockType: TransactionType, blockCategories: Category[]) => {
    const sortConfig = sortByType[blockType];
    const sortedCategories = [...blockCategories].sort((a, b) => {
      const aRealized = getRealizedByCategory(a.id, blockType);
      const bRealized = getRealizedByCategory(b.id, blockType);
      const aBudget = getBudgetByCategory(a.id);
      const bBudget = getBudgetByCategory(b.id);
      const aDifference = aBudget - aRealized;
      const bDifference = bBudget - bRealized;
      const multiplier = sortConfig.direction === "asc" ? 1 : -1;

      if (sortConfig.field === "category") {
        return a.name.localeCompare(b.name, "pt-BR") * multiplier;
      }

      if (sortConfig.field === "budget") {
        return (aBudget - bBudget) * multiplier;
      }

      if (sortConfig.field === "realized") {
        return (aRealized - bRealized) * multiplier;
      }

      return (aDifference - bDifference) * multiplier;
    });

    return (
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAddingType(blockType);
                setNewCategoryName("");
                setNewCategoryBudget("");
                setError("");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              title={`Adicionar nova ${blockType === "income" ? "receita" : "despesa"}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>

        {blockCategories.length === 0 && addingType !== blockType ? (
          <p className="text-sm text-gray-600">Nenhuma categoria encontrada para este bloco.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSortType(blockType, "category")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-gray-900"
                    >
                      Categoria {renderSortIcon(blockType, "category")}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSortType(blockType, "budget")}
                      className="inline-flex items-center justify-end gap-1 font-semibold hover:text-gray-900"
                    >
                      Orçado {renderSortIcon(blockType, "budget")}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSortType(blockType, "realized")}
                      className="inline-flex items-center justify-end gap-1 font-semibold hover:text-gray-900"
                    >
                      Realizado {renderSortIcon(blockType, "realized")}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSortType(blockType, "difference")}
                      className="inline-flex items-center justify-end gap-1 font-semibold hover:text-gray-900"
                    >
                      Diferença {renderSortIcon(blockType, "difference")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {addingType === blockType && (
                  <tr className="border-b border-blue-100 bg-blue-50/40">
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder={`Nova ${blockType === "income" ? "receita" : "despesa"}`}
                        className="w-full rounded border border-blue-300 px-2 py-1 text-sm text-gray-900"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newCategoryBudget}
                          onChange={(e) => setNewCategoryBudget(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveNewCategoryRow(blockType);
                            }
                          }}
                          placeholder="0,00"
                          className="w-24 rounded border border-blue-300 px-2 py-1 text-right text-sm text-gray-900"
                        />
                        <button
                          type="button"
                          onClick={() => saveNewCategoryRow(blockType)}
                          disabled={creatingCategoryRow}
                          className="rounded-md p-1 text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                          title="Salvar nova linha"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingType(null);
                            setNewCategoryName("");
                            setNewCategoryBudget("");
                          }}
                          className="rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100"
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-gray-500">{formatCurrencyBr(0)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-green-700">{formatCurrencyBr(0)}</td>
                  </tr>
                )}

                {sortedCategories.map((category) => {
                  const rowKey = `${blockType}:${category.id}`;
                  const isEditing = editingRowKey === rowKey;
                  const isRenamingThis = editingCategoryId === category.id;
                  const budget = getBudgetByCategory(category.id);
                  const realized = getRealizedByCategory(category.id, blockType);
                  const difference = budget - realized;

                  return (
                    <tr key={category.id} className="border-b border-gray-100">
                      <td className="px-2 py-2 font-medium text-gray-900">
                        {isRenamingThis ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveCategoryRename(category.id); }
                                if (e.key === "Escape") { setEditingCategoryId(null); }
                              }}
                              autoFocus
                              className="w-40 rounded border border-blue-300 px-2 py-0.5 text-sm text-gray-900"
                            />
                            <button
                              type="button"
                              onClick={() => saveCategoryRename(category.id)}
                              disabled={savingCategoryName}
                              className="rounded p-0.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              title="Salvar nome"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCategoryId(null)}
                              className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-1">
                            <span>{category.name}</span>
                            <button
                              type="button"
                              onClick={() => startCategoryRename(category)}
                              className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-500"
                              title="Renomear categoria"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCategory(category.id, blockType)}
                              className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                              title={`Remover ${blockType === "income" ? "receita" : "despesa"} do orçamento`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingBudgetValue}
                              onChange={(e) => setEditingBudgetValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveBudgetEdit(category.id, blockType);
                                }
                              }}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm text-gray-900"
                            />
                          ) : (
                            <span className="font-semibold text-gray-900">{formatCurrencyBr(budget)}</span>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              isEditing
                                ? saveBudgetEdit(category.id, blockType)
                                : startBudgetEdit(category.id, blockType)
                            }
                            disabled={savingBudget && isEditing}
                            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                            title={isEditing ? "Salvar orçamento" : "Editar orçamento"}
                          >
                            {isEditing ? (
                              <Save className="h-3.5 w-3.5" />
                            ) : (
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-gray-800">
                        {formatCurrencyBr(realized)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-semibold ${
                          difference < 0 ? "text-red-700" : "text-green-700"
                        }`}
                      >
                        {formatCurrencyBr(difference)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Faça login para acessar</h2>
            <p className="mt-2 text-gray-600">Você precisa estar autenticado para visualizar o orçamento.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Modal de confirmação - Apagar Tudo */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Apagar todos os dados de {period}?</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Esta ação irá apagar <strong>permanentemente</strong> todos os lançamentos e valores orçados do período <strong>{monthOptions.find((m) => m.value === selectedMonth)?.label}/{selectedYear}</strong>.
                  <br /><br />
                  Esta operação <strong>não pode ser desfeita</strong>.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deletingAll}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={deleteAllPeriod}
                disabled={deletingAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingAll ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deletingAll ? "Apagando..." : "Sim, apagar tudo"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orçamento x Realizado</h1>
          <p className="mt-1 text-sm text-gray-600">
            Defina o valor orçado por categoria e acompanhe o realizado com base nos lançamentos do mês.
          </p>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-lg">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mês</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ano</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setCopyPanelOpen((prev) => !prev)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {copyPanelOpen ? "Fechar cópia de orçamento" : "Copiar orçado de outro mês/ano"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Apagar Tudo
            </button>
          </div>

          {copyPanelOpen && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-3 text-sm font-medium text-blue-900">
                Copiar valores orçados de um período de origem para {period}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:max-w-lg">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-900">
                    Mês de origem
                  </label>
                  <select
                    value={copyFromMonth}
                    onChange={(e) => setCopyFromMonth(Number(e.target.value))}
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-900">
                    Ano de origem
                  </label>
                  <select
                    value={copyFromYear}
                    onChange={(e) => setCopyFromYear(Number(e.target.value))}
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={copyBudgetsFromAnotherPeriod}
                  disabled={copyingBudgets}
                  className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copyingBudgets ? "Copiando..." : `Copiar para ${period}`}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}
        </section>

        {loading ? (
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-600">Carregando orçamento...</p>
          </section>
        ) : (
          <>
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">Totais de Receitas</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Orçado</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrencyBr(budgetTotals.incomeBudget)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Realizado</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrencyBr(budgetTotals.incomeRealized)}</p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Diferença</p>
                  <p className="mt-1 text-xl font-bold text-orange-700">
                    {formatCurrencyBr(budgetTotals.incomeBudget - budgetTotals.incomeRealized)}
                  </p>
                </div>
              </div>
            </section>

            {renderBlock("RECEITAS", "income", incomeCategories)}

            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">Totais de Despesas</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Orçado</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrencyBr(budgetTotals.expenseBudget)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Realizado</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrencyBr(budgetTotals.expenseRealized)}</p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Diferença</p>
                  <p className="mt-1 text-xl font-bold text-orange-700">
                    {formatCurrencyBr(budgetTotals.expenseBudget - budgetTotals.expenseRealized)}
                  </p>
                </div>
              </div>
            </section>

            {renderBlock("DESPESAS", "expense", expenseCategories)}

            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Fluxo de Caixa (Receitas - Despesas)</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Orçado</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrencyBr(budgetTotals.resultBudget)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Realizado</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrencyBr(budgetTotals.resultRealized)}</p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Diferença</p>
                  <p className="mt-1 text-xl font-bold text-orange-700">
                    {formatCurrencyBr(budgetTotals.resultBudget - budgetTotals.resultRealized)}
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}
