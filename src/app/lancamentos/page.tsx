"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { db } from "@/lib/firebase/client";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileText,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type {
  Category,
  CreditCard,
  IncomeForecast,
  PaymentMethod,
  Transaction,
  TransactionType,
} from "@/types/firestore";

interface ManualFormData {
  description: string;
  amount: string;
  date: string;
  type: TransactionType;
  categoryId: string;
  paymentMethod: PaymentMethod;
  creditCardId: string;
  deductFromForecast: boolean;
  incomeForecastId: string;
}

interface ForecastFormData {
  name: string;
  amount: string;
  month: string;
}

interface RowEditData {
  date: string;
  description: string;
  type: TransactionType;
  categoryId: string;
  newCategoryName: string;
  paymentMethod: PaymentMethod;
  creditCardId: string;
  amount: string;
}

type SortField =
  | "date"
  | "description"
  | "type"
  | "category"
  | "payment"
  | "card"
  | "amount";

type SortDirection = "asc" | "desc";

const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "pix", label: "PIX" },
  { value: "bank_transfer", label: "Transferência" },
  { value: "credit_card", label: "Cartão de crédito" },
];

const transactionTypeOptions: Array<{ value: TransactionType; label: string }> = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
];

export default function LancamentosPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingCategoryBulk, setUpdatingCategoryBulk] = useState(false);
  const [savingRowEdit, setSavingRowEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [incomeForecasts, setIncomeForecasts] = useState<IncomeForecast[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkNewCategoryName, setBulkNewCategoryName] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<"all" | PaymentMethod>("all");
  const [filterCategoryId, setFilterCategoryId] = useState("all");
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterCardId, setFilterCardId] = useState<"all" | "none" | string>("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
    field: "date",
    direction: "desc",
  });
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowEditData, setRowEditData] = useState<RowEditData | null>(null);
  const [creatingForecast, setCreatingForecast] = useState(false);
  const [selectedForecastMonth, setSelectedForecastMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const [forecastForm, setForecastForm] = useState<ForecastFormData>({
    name: "",
    amount: "",
    month: new Date().toISOString().slice(0, 7),
  });

  const [manualForm, setManualForm] = useState<ManualFormData>({
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    type: "expense",
    categoryId: "",
    paymentMethod: "pix",
    creditCardId: "",
    deductFromForecast: false,
    incomeForecastId: "",
  });

  const filteredCategories = useMemo(
    () => categories.filter((cat) => cat.type === manualForm.type),
    [categories, manualForm.type],
  );

  const selectedCount = selectedIds.length;
  const allSelected = transactions.length > 0 && selectedCount === transactions.length;

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.includes(tx.id)),
    [transactions, selectedIds],
  );

  const selectedTypeSet = useMemo(
    () => new Set(selectedTransactions.map((tx) => tx.type)),
    [selectedTransactions],
  );

  const selectedSingleType = selectedTypeSet.size === 1
    ? selectedTransactions[0]?.type
    : undefined;

  const bulkCategoryOptions = useMemo(() => {
    if (!selectedSingleType) return [];
    return categories.filter((cat) => cat.type === selectedSingleType);
  }, [categories, selectedSingleType]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterPaymentMethod !== "all" && tx.payment_method !== filterPaymentMethod) {
        return false;
      }

      if (filterCategoryId !== "all" && tx.category_id !== filterCategoryId) {
        return false;
      }

      if (filterType !== "all" && tx.type !== filterType) {
        return false;
      }

      if (filterCardId === "none" && tx.credit_card_id) {
        return false;
      }

      if (filterCardId !== "all" && filterCardId !== "none" && tx.credit_card_id !== filterCardId) {
        return false;
      }

      if (filterStartDate && tx.date < filterStartDate) {
        return false;
      }

      if (filterEndDate && tx.date > filterEndDate) {
        return false;
      }

      return true;
    });
  }, [
    transactions,
    filterPaymentMethod,
    filterCategoryId,
    filterType,
    filterCardId,
    filterStartDate,
    filterEndDate,
  ]);

  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions];
    const directionMultiplier = sortConfig.direction === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      if (sortConfig.field === "amount") {
        return (a.amount - b.amount) * directionMultiplier;
      }

      if (sortConfig.field === "date") {
        return a.date.localeCompare(b.date) * directionMultiplier;
      }

      if (sortConfig.field === "description") {
        return a.description
          .toLocaleLowerCase("pt-BR")
          .localeCompare(b.description.toLocaleLowerCase("pt-BR"), "pt-BR") * directionMultiplier;
      }

      if (sortConfig.field === "type") {
        return a.type.localeCompare(b.type, "pt-BR") * directionMultiplier;
      }

      if (sortConfig.field === "category") {
        const aCategory = categories.find((cat) => cat.id === a.category_id)?.name ?? "";
        const bCategory = categories.find((cat) => cat.id === b.category_id)?.name ?? "";
        return aCategory.localeCompare(bCategory, "pt-BR") * directionMultiplier;
      }

      if (sortConfig.field === "payment") {
        return a.payment_method.localeCompare(b.payment_method, "pt-BR") * directionMultiplier;
      }

      const aCard = creditCards.find((card) => card.id === a.credit_card_id)?.name ?? "";
      const bCard = creditCards.find((card) => card.id === b.credit_card_id)?.name ?? "";
      return aCard.localeCompare(bCard, "pt-BR") * directionMultiplier;
    });

    return sorted;
  }, [filteredTransactions, sortConfig, categories, creditCards]);

  const forecastsForSelectedMonth = useMemo(
    () => incomeForecasts.filter((forecast) => forecast.month === selectedForecastMonth),
    [incomeForecasts, selectedForecastMonth],
  );

  const forecastSummary = useMemo(() => {
    const totalPlanned = forecastsForSelectedMonth.reduce((sum, item) => sum + item.amount, 0);

    const realizedByForecast = forecastsForSelectedMonth.map((forecast) => {
      const realized = transactions
        .filter(
          (tx) =>
            tx.type === "income" &&
            tx.income_forecast_id === forecast.id &&
            tx.date.slice(0, 7) === selectedForecastMonth,
        )
        .reduce((sum, tx) => sum + tx.amount, 0);

      return {
        forecast,
        realized,
        remaining: forecast.amount - realized,
      };
    });

    const totalRealized = realizedByForecast.reduce((sum, item) => sum + item.realized, 0);

    return {
      totalPlanned,
      totalRealized,
      totalRemaining: totalPlanned - totalRealized,
      byForecast: realizedByForecast,
    };
  }, [forecastsForSelectedMonth, selectedForecastMonth, transactions]);

  const eligibleForecastsForManualDate = useMemo(
    () =>
      incomeForecasts.filter((forecast) => forecast.month === manualForm.date.slice(0, 7)),
    [incomeForecasts, manualForm.date],
  );

  const loadData = async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError("");

    try {
      const transactionsQuery = query(
        collection(db, "transactions"),
        where("user_id", "==", user.uid),
      );
      const categoriesQuery = query(
        collection(db, "categories"),
        where("user_id", "==", user.uid),
      );
      const cardsQuery = query(
        collection(db, "creditCards"),
        where("user_id", "==", user.uid),
      );
      const forecastsQuery = query(
        collection(db, "incomeForecasts"),
        where("user_id", "==", user.uid),
      );

      const [transactionsSnapshot, categoriesSnapshot, cardsSnapshot, forecastsSnapshot] = await Promise.all([
        getDocs(transactionsQuery),
        getDocs(categoriesQuery),
        getDocs(cardsQuery),
        getDocs(forecastsQuery),
      ]);

      const txList = transactionsSnapshot.docs
        .map((item) => item.data() as Transaction)
        .sort((a, b) => b.date.localeCompare(a.date));

      const categoryList = categoriesSnapshot.docs.map((item) => item.data() as Category);
      const cardList = cardsSnapshot.docs.map((item) => item.data() as CreditCard);
      const forecastList = forecastsSnapshot.docs
        .map((item) => item.data() as IncomeForecast)
        .sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));

      setTransactions(txList);
      setCategories(categoryList);
      setCreditCards(cardList);
      setIncomeForecasts(forecastList);
      setSelectedIds([]);

      setManualForm((prev) => {
        const currentCategoryStillValid = categoryList.some(
          (cat) => cat.id === prev.categoryId && cat.type === prev.type,
        );
        const fallbackCategory = categoryList.find((cat) => cat.type === prev.type)?.id ?? "";

        return {
          ...prev,
          categoryId: currentCategoryStillValid ? prev.categoryId : fallbackCategory,
        };
      });
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar os lançamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    loadData();
  }, [user?.uid]);

  useEffect(() => {
    const stillValid = filteredCategories.some((cat) => cat.id === manualForm.categoryId);
    if (!stillValid) {
      setManualForm((prev) => ({
        ...prev,
        categoryId: filteredCategories[0]?.id ?? "",
      }));
    }
  }, [filteredCategories, manualForm.categoryId]);

  useEffect(() => {
    if (!manualForm.deductFromForecast) return;

    const valid = eligibleForecastsForManualDate.some(
      (forecast) => forecast.id === manualForm.incomeForecastId,
    );

    if (!valid) {
      setManualForm((prev) => ({
        ...prev,
        incomeForecastId: eligibleForecastsForManualDate[0]?.id ?? "",
      }));
    }
  }, [eligibleForecastsForManualDate, manualForm.deductFromForecast, manualForm.incomeForecastId]);

  const handleCreateForecast = async () => {
    if (!user?.uid) {
      setError("Faça login para criar previsões.");
      return;
    }

    const name = forecastForm.name.trim();
    const amount = Math.abs(Number(forecastForm.amount));

    if (!name) {
      setError("Informe o nome da previsão (ex.: Extra, Receita marido, Receita esposa)." );
      return;
    }

    if (!forecastForm.month) {
      setError("Informe o mês da previsão.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor de previsão válido.");
      return;
    }

    setCreatingForecast(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date().toISOString();
      const ref = doc(collection(db, "incomeForecasts"));
      const forecast: IncomeForecast = {
        id: ref.id,
        user_id: user.uid,
        name,
        month: forecastForm.month,
        amount,
        created_at: now,
        updated_at: now,
      };

      await setDoc(ref, forecast);
      setSuccess("Previsão de receita criada com sucesso.");
      setForecastForm((prev) => ({ ...prev, name: "", amount: "" }));
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao criar previsão de receita.");
    } finally {
      setCreatingForecast(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(transactions.map((tx) => tx.id));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      setError("Selecione pelo menos um lançamento para excluir.");
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const batch = writeBatch(db);

      for (const id of selectedIds) {
        const ref = doc(db, "transactions", id);
        batch.delete(ref);
      }

      await batch.commit();
      setSuccess(`${selectedIds.length} lançamento(s) excluído(s) com sucesso.`);
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao excluir lançamentos em lote.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    setSortConfig((prev) => {
      if (prev.field !== field) {
        return { field, direction: "asc" };
      }

      return {
        field,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    }

    if (sortConfig.direction === "asc") {
      return <ArrowUp className="h-3.5 w-3.5 text-orange-600" />;
    }

    return <ArrowDown className="h-3.5 w-3.5 text-orange-600" />;
  };

  const clearFilters = () => {
    setFilterPaymentMethod("all");
    setFilterCategoryId("all");
    setFilterType("all");
    setFilterCardId("all");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const beginRowEdit = (tx: Transaction) => {
    setEditingRowId(tx.id);
    setRowEditData({
      date: tx.date,
      description: tx.description,
      type: tx.type,
      categoryId: tx.category_id,
      newCategoryName: "",
      paymentMethod: tx.payment_method,
      creditCardId: tx.credit_card_id ?? "",
      amount: String(tx.amount),
    });
  };

  const updateRowEditField = <K extends keyof RowEditData>(field: K, value: RowEditData[K]) => {
    setRowEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const saveRowEdit = async (txId: string) => {
    if (!rowEditData) return;

    const description = rowEditData.description.trim();
    const amount = Math.abs(Number(rowEditData.amount));
    const rowType = rowEditData.type;
    const categoriesForType = categories.filter((cat) => cat.type === rowType);
    let finalCategoryId = rowEditData.categoryId;
    const typedCategoryName = rowEditData.newCategoryName.trim();

    if (!description) {
      setError("Descrição é obrigatória para salvar edição.");
      return;
    }

    if (!rowEditData.date) {
      setError("Data é obrigatória para salvar edição.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Valor inválido para salvar edição.");
      return;
    }

    if (typedCategoryName) {
      const normalizedTyped = typedCategoryName.toLocaleLowerCase("pt-BR").trim();
      const existingByName = categoriesForType.find(
        (cat) => cat.name.toLocaleLowerCase("pt-BR").trim() === normalizedTyped,
      );

      if (existingByName) {
        finalCategoryId = existingByName.id;
      } else {
        const categoryRef = doc(collection(db, "categories"));
        const newCategory: Category = {
          id: categoryRef.id,
          user_id: user!.uid,
          name: typedCategoryName,
          type: rowType,
          is_variable: true,
        };

        await setDoc(categoryRef, newCategory);
        setCategories((prev) => [...prev, newCategory]);
        finalCategoryId = newCategory.id;
      }
    }

    if (!finalCategoryId) {
      finalCategoryId = categoriesForType[0]?.id ?? "";
    }

    if (!finalCategoryId) {
      const categoryRef = doc(collection(db, "categories"));
      const defaultCategory: Category = {
        id: categoryRef.id,
        user_id: user!.uid,
        name: rowType === "income" ? "Receitas gerais" : "Despesas gerais",
        type: rowType,
        is_variable: true,
      };

      await setDoc(categoryRef, defaultCategory);
      setCategories((prev) => [...prev, defaultCategory]);
      finalCategoryId = defaultCategory.id;
    }

    if (rowEditData.paymentMethod === "credit_card" && !rowEditData.creditCardId) {
      setError("Selecione um cartão para pagamento em cartão de crédito.");
      return;
    }

    setSavingRowEdit(true);
    setError("");

    try {
      const updatePayload: Partial<Transaction> = {
        date: rowEditData.date,
        description,
        amount,
        type: rowType,
        category_id: finalCategoryId,
        payment_method: rowEditData.paymentMethod,
        credit_card_id: rowEditData.paymentMethod === "credit_card" ? rowEditData.creditCardId : null,
        updated_at: new Date().toISOString(),
      };

      if (rowType !== "income") {
        updatePayload.income_forecast_id = null;
      }

      await updateDoc(doc(db, "transactions", txId), updatePayload);

      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === txId
            ? {
                ...tx,
                ...updatePayload,
                amount,
                description,
                date: rowEditData.date,
                type: rowType,
                category_id: finalCategoryId,
                payment_method: rowEditData.paymentMethod,
                credit_card_id:
                  rowEditData.paymentMethod === "credit_card" ? rowEditData.creditCardId : null,
              }
            : tx,
        ),
      );

      setEditingRowId(null);
      setRowEditData(null);
      setSuccess("Lançamento atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro ao salvar edição do lançamento.");
    } finally {
      setSavingRowEdit(false);
    }
  };

  const handleBulkChangeCategory = async () => {
    if (selectedIds.length === 0) {
      setError("Selecione pelo menos um lançamento para alterar a categoria.");
      return;
    }

    if (selectedTypeSet.size > 1) {
      setError("Selecione lançamentos de um único tipo por vez (somente receitas ou somente despesas).");
      return;
    }

    const typedCategoryName = bulkNewCategoryName.trim();

    if (!bulkCategoryId && !typedCategoryName) {
      setError("Selecione uma categoria existente ou digite uma nova categoria para aplicar em massa.");
      return;
    }

    setUpdatingCategoryBulk(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date().toISOString();
      let targetCategoryId = bulkCategoryId;
      let createdCategoryName = "";

      if (typedCategoryName) {
        const normalizedTyped = typedCategoryName.toLocaleLowerCase("pt-BR").trim();
        const existingByName = categories.find(
          (cat) =>
            cat.type === selectedSingleType &&
            cat.name.toLocaleLowerCase("pt-BR").trim() === normalizedTyped,
        );

        if (existingByName) {
          targetCategoryId = existingByName.id;
        } else {
          const categoryRef = doc(collection(db, "categories"));
          const newCategory: Category = {
            id: categoryRef.id,
            user_id: user!.uid,
            name: typedCategoryName,
            type: selectedSingleType!,
            is_variable: true,
          };

          await setDoc(categoryRef, newCategory);
          setCategories((prev) => [...prev, newCategory]);
          targetCategoryId = categoryRef.id;
          createdCategoryName = newCategory.name;
        }
      }

      const batch = writeBatch(db);

      for (const id of selectedIds) {
        const ref = doc(db, "transactions", id);
        batch.update(ref, {
          category_id: targetCategoryId,
          updated_at: now,
        });
      }

      await batch.commit();
      const baseMsg = `${selectedIds.length} lançamento(s) atualizado(s) com a nova categoria.`;
      setSuccess(
        createdCategoryName
          ? `${baseMsg} Categoria "${createdCategoryName}" criada e salva para uso futuro.`
          : baseMsg,
      );
      setBulkCategoryId("");
      setBulkNewCategoryName("");
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar categoria em massa.");
    } finally {
      setUpdatingCategoryBulk(false);
    }
  };

  const handleCreateManual = async () => {
    if (!user?.uid) {
      setError("Faça login para lançar manualmente.");
      return;
    }

    const description = manualForm.description.trim();
    const amount = Math.abs(Number(manualForm.amount));

    if (!description) {
      setError("Informe a descrição do lançamento.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor válido maior que zero.");
      return;
    }

    if (!manualForm.date) {
      setError("Informe a data do lançamento.");
      return;
    }

    if (manualForm.paymentMethod === "credit_card" && !manualForm.creditCardId) {
      setError("Selecione o cartão para pagamento em cartão de crédito.");
      return;
    }

    if (
      manualForm.type === "income" &&
      manualForm.deductFromForecast &&
      !manualForm.incomeForecastId
    ) {
      setError("Selecione de qual previsão de receita este lançamento deve debitar.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date().toISOString();
      let finalCategoryId = manualForm.categoryId || filteredCategories[0]?.id || "";

      if (!finalCategoryId) {
        const categoryRef = doc(collection(db, "categories"));
        const defaultCategory: Category = {
          id: categoryRef.id,
          user_id: user.uid,
          name: manualForm.type === "income" ? "Receitas gerais" : "Despesas gerais",
          type: manualForm.type,
          is_variable: true,
        };

        await setDoc(categoryRef, defaultCategory);
        setCategories((prev) => [...prev, defaultCategory]);
        finalCategoryId = categoryRef.id;
      }

      const ref = doc(collection(db, "transactions"));

      const transaction: Transaction = {
        id: ref.id,
        user_id: user.uid,
        description,
        amount,
        date: manualForm.date,
        category_id: finalCategoryId,
        type: manualForm.type,
        status: "posted",
        payment_method: manualForm.paymentMethod,
        credit_card_id:
          manualForm.paymentMethod === "credit_card" ? manualForm.creditCardId : null,
        is_recurring: false,
        installment_current: 1,
        installment_total: 1,
        projection_of: null,
        income_forecast_id:
          manualForm.type === "income" && manualForm.deductFromForecast
            ? manualForm.incomeForecastId
            : null,
        created_at: now,
        updated_at: now,
      };

      await setDoc(ref, transaction);

      setSuccess("Lançamento manual criado com sucesso.");
      setManualForm((prev) => ({
        ...prev,
        description: "",
        amount: "",
        categoryId: finalCategoryId,
        deductFromForecast: prev.type === "income" ? prev.deductFromForecast : false,
        incomeForecastId: prev.type === "income" ? prev.incomeForecastId : "",
      }));

      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao criar lançamento manual.");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryNameById = (id: string) => categories.find((cat) => cat.id === id)?.name ?? "-";
  const cardNameById = (id: string | null) =>
    creditCards.find((card) => card.id === id)?.name ?? "-";

  const formatDateBr = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), "dd-MM-yy");
    } catch {
      return dateValue;
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Faça login para acessar</h2>
            <p className="mt-2 text-gray-600">Você precisa estar autenticado para gerenciar lançamentos.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tudo que entra pelo upload aparece aqui. Você também pode criar lançamentos manuais.
          </p>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Previsão de receitas do mês</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome da previsão</label>
              <input
                type="text"
                value={forecastForm.name}
                onChange={(e) => setForecastForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                placeholder="Ex.: Extra, Receita marido..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor previsto (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={forecastForm.amount}
                onChange={(e) => setForecastForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mês</label>
              <input
                type="month"
                value={forecastForm.month}
                onChange={(e) => setForecastForm((prev) => ({ ...prev, month: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleCreateForecast}
                disabled={creatingForecast}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creatingForecast ? "Criando..." : "Criar previsão"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Previsto no mês</p>
              <p className="mt-1 text-xl font-bold text-gray-900">R$ {forecastSummary.totalPlanned.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">Realizado (debitado)</p>
              <p className="mt-1 text-xl font-bold text-green-700">R$ {forecastSummary.totalRealized.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Saldo da previsão</p>
              <p className="mt-1 text-xl font-bold text-orange-700">R$ {forecastSummary.totalRemaining.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-4 max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Visualizar mês</label>
            <input
              type="month"
              value={selectedForecastMonth}
              onChange={(e) => setSelectedForecastMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="px-2 py-2">Previsão</th>
                  <th className="px-2 py-2 text-right">Valor previsto</th>
                  <th className="px-2 py-2 text-right">Realizado</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {forecastSummary.byForecast.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-gray-500">
                      Nenhuma previsão cadastrada para {selectedForecastMonth}.
                    </td>
                  </tr>
                ) : (
                  forecastSummary.byForecast.map((item) => (
                    <tr key={item.forecast.id} className="border-b border-gray-100">
                      <td className="px-2 py-2 font-medium text-gray-900">{item.forecast.name}</td>
                      <td className="px-2 py-2 text-right text-gray-800">R$ {item.forecast.amount.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-green-700">R$ {item.realized.toFixed(2)}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${item.remaining < 0 ? "text-red-700" : "text-orange-700"}`}>
                        R$ {item.remaining.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Novo lançamento manual</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
              <input
                type="text"
                value={manualForm.description}
                onChange={(e) => setManualForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                placeholder="Ex.: Salário, Supermercado..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualForm.amount}
                onChange={(e) => setManualForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data</label>
              <input
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
              <select
                value={manualForm.type}
                onChange={(e) =>
                  setManualForm((prev) => ({
                    ...prev,
                    type: e.target.value as TransactionType,
                    deductFromForecast:
                      e.target.value === "income" ? prev.deductFromForecast : false,
                    incomeForecastId:
                      e.target.value === "income" ? prev.incomeForecastId : "",
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {transactionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {manualForm.type === "income" && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 md:col-span-2 lg:col-span-3">
                <label className="flex items-center gap-2 text-sm font-medium text-green-900">
                  <input
                    type="checkbox"
                    checked={manualForm.deductFromForecast}
                    onChange={(e) =>
                      setManualForm((prev) => ({
                        ...prev,
                        deductFromForecast: e.target.checked,
                        incomeForecastId: e.target.checked
                          ? prev.incomeForecastId || eligibleForecastsForManualDate[0]?.id || ""
                          : "",
                      }))
                    }
                    className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                  />
                  Debitar esta receita da previsão do mês?
                </label>

                {manualForm.deductFromForecast && (
                  <div className="mt-3 max-w-md">
                    <label className="mb-1 block text-sm font-medium text-green-900">Qual previsão?</label>
                    <select
                      value={manualForm.incomeForecastId}
                      onChange={(e) =>
                        setManualForm((prev) => ({ ...prev, incomeForecastId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">
                        {eligibleForecastsForManualDate.length === 0
                          ? "Nenhuma previsão nesse mês (crie acima)"
                          : "Selecione a previsão"}
                      </option>
                      {eligibleForecastsForManualDate.map((forecast) => (
                        <option key={forecast.id} value={forecast.id}>
                          {forecast.name} — R$ {forecast.amount.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
              <select
                value={manualForm.categoryId}
                onChange={(e) => setManualForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                disabled={filteredCategories.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="">
                  {filteredCategories.length === 0
                    ? "Sem categoria ainda (será criada automaticamente)"
                    : "Selecione"}
                </option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Método de pagamento</label>
              <select
                value={manualForm.paymentMethod}
                onChange={(e) =>
                  setManualForm((prev) => ({
                    ...prev,
                    paymentMethod: e.target.value as PaymentMethod,
                    creditCardId: e.target.value === "credit_card" ? prev.creditCardId : "",
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {manualForm.paymentMethod === "credit_card" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cartão</label>
                <select
                  value={manualForm.creditCardId}
                  onChange={(e) =>
                    setManualForm((prev) => ({ ...prev, creditCardId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
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
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleCreateManual}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Salvando..." : "Adicionar lançamento"}
            </button>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Lista de lançamentos</h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                disabled={selectedCount === 0 || selectedTypeSet.size > 1}
                className="min-w-64 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                <option value="">
                  {selectedCount === 0
                    ? "Selecione lançamentos primeiro"
                    : selectedTypeSet.size > 1
                      ? "Selecione apenas um tipo (receita ou despesa)"
                      : "Nova categoria para os selecionados"}
                </option>
                {bulkCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={bulkNewCategoryName}
                onChange={(e) => setBulkNewCategoryName(e.target.value)}
                disabled={selectedCount === 0 || selectedTypeSet.size > 1}
                placeholder={
                  selectedCount === 0
                    ? "Selecione lançamentos para nova categoria"
                    : selectedTypeSet.size > 1
                      ? "Selecione um único tipo para criar categoria"
                      : "Ou digite uma nova categoria"
                }
                className="min-w-64 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              />

              <button
                type="button"
                onClick={handleBulkChangeCategory}
                disabled={updatingCategoryBulk || selectedCount === 0 || selectedTypeSet.size > 1}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updatingCategoryBulk
                  ? "Atualizando categoria..."
                  : selectedCount > 0
                    ? `Mudar categoria (${selectedCount})`
                    : "Mudar categoria"}
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting || selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deleting
                  ? "Excluindo..."
                  : selectedCount > 0
                    ? `Excluir selecionados (${selectedCount})`
                    : "Excluir selecionados"}
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Pagamento</label>
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value as "all" | PaymentMethod)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              >
                <option value="all">Todos</option>
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Categoria</label>
              <select
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              >
                <option value="all">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "all" | TransactionType)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              >
                <option value="all">Todos</option>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Cartão</label>
              <select
                value={filterCardId}
                onChange={(e) => setFilterCardId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              >
                <option value="all">Todos</option>
                <option value="none">Sem cartão</option>
                {creditCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Data inicial</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Data final</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Exibindo <span className="font-semibold text-gray-900">{sortedTransactions.length}</span> de {transactions.length} lançamento(s)
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Limpar filtros
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-600">Carregando lançamentos...</p>
          ) : sortedTransactions.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhum lançamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Data {renderSortIcon("date")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("description")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Descrição {renderSortIcon("description")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("type")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Tipo {renderSortIcon("type")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("category")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Categoria {renderSortIcon("category")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("payment")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Pagamento {renderSortIcon("payment")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort("card")} className="inline-flex items-center gap-1 font-semibold hover:text-gray-900">
                        Cartão {renderSortIcon("card")}
                      </button>
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort("amount")} className="inline-flex items-center justify-end gap-1 font-semibold hover:text-gray-900">
                        Valor (R$) {renderSortIcon("amount")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((tx) => {
                    const isSelected = selectedIds.includes(tx.id);
                    const isEditing = editingRowId === tx.id && rowEditData !== null;
                    const rowCategories = categories.filter(
                      (cat) => cat.type === (isEditing ? rowEditData.type : tx.type),
                    );

                    return (
                      <tr key={tx.id} className="border-b border-gray-100">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(tx.id)}
                            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-800">
                          {isEditing ? (
                            <input
                              type="date"
                              value={rowEditData.date}
                              onChange={(e) => updateRowEditField("date", e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                            />
                          ) : (
                            formatDateBr(tx.date)
                          )}
                        </td>
                        <td className="px-2 py-2 text-gray-900 font-medium">
                          {isEditing ? (
                            <input
                              type="text"
                              value={rowEditData.description}
                              onChange={(e) => updateRowEditField("description", e.target.value)}
                              className="w-56 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                            />
                          ) : (
                            tx.description
                          )}
                          {tx.import_batch_id && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                              Upload
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <select
                              value={rowEditData.type}
                              onChange={(e) => {
                                const newType = e.target.value as TransactionType;
                                const firstCategory = categories.find((cat) => cat.type === newType)?.id ?? "";
                                setRowEditData((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        type: newType,
                                        categoryId:
                                          categories.some(
                                            (cat) => cat.id === prev.categoryId && cat.type === newType,
                                          )
                                            ? prev.categoryId
                                            : firstCategory,
                                      }
                                    : prev,
                                );
                              }}
                              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                            >
                              <option value="expense">Despesa</option>
                              <option value="income">Receita</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                tx.type === "expense"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {tx.type === "expense" ? "Despesa" : "Receita"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-800">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <select
                                value={rowEditData.categoryId}
                                onChange={(e) => updateRowEditField("categoryId", e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                              >
                                <option value="">Selecione</option>
                                {rowCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={rowEditData.newCategoryName}
                                onChange={(e) => updateRowEditField("newCategoryName", e.target.value)}
                                placeholder="Ou digite nova categoria"
                                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                              />
                            </div>
                          ) : (
                            categoryNameById(tx.category_id)
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-800">
                          {isEditing ? (
                            <select
                              value={rowEditData.paymentMethod}
                              onChange={(e) =>
                                setRowEditData((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        paymentMethod: e.target.value as PaymentMethod,
                                        creditCardId:
                                          e.target.value === "credit_card" ? prev.creditCardId : "",
                                      }
                                    : prev,
                                )
                              }
                              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                            >
                              {paymentMethodOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            tx.payment_method
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-800">
                          {isEditing ? (
                            rowEditData.paymentMethod === "credit_card" ? (
                              <select
                                value={rowEditData.creditCardId}
                                onChange={(e) => updateRowEditField("creditCardId", e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                              >
                                <option value="">Selecione o cartão</option>
                                {creditCards.map((card) => (
                                  <option key={card.id} value={card.id}>
                                    {card.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-500">-</span>
                            )
                          ) : tx.credit_card_id ? (
                            cardNameById(tx.credit_card_id)
                          ) : (
                            "-"
                          )}
                        </td>
                        <td
                          className={`px-2 py-2 whitespace-nowrap text-right font-semibold ${
                            tx.type === "expense" ? "text-red-700" : "text-green-700"
                          }`}
                        >
                          <div className="inline-flex items-center gap-2">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={rowEditData.amount}
                                onChange={(e) => updateRowEditField("amount", e.target.value)}
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm text-gray-900"
                              />
                            ) : (
                              <span>
                                {tx.type === "expense" ? "-" : "+"} {tx.amount.toFixed(2)}
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  saveRowEdit(tx.id);
                                  return;
                                }
                                beginRowEdit(tx);
                              }}
                              disabled={savingRowEdit && isEditing}
                              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                              title={isEditing ? "Salvar edição" : "Editar lançamento"}
                            >
                              {isEditing ? <Save className="h-3.5 w-3.5" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
