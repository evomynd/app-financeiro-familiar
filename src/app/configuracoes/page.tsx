"use client";

import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  Settings as SettingsIcon,
  CreditCard as CreditCardIcon,
  Percent,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCreditCards,
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
} from "@/lib/actions/creditCards";
import { getUserProfile } from "@/lib/actions/users";
import { updateUserProfile } from "@/lib/actions/profile";
import { exportTransactionsCsv } from "@/lib/actions/export";
import { CardSkeleton } from "@/components/shared/LoadingSkeleton";
import type { CreditCard } from "@/types/firestore";

interface EditingCard extends CreditCard {
  isNew?: boolean;
}

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [overdraftRate, setOverdraftRate] = useState(8);
  const [editingCard, setEditingCard] = useState<EditingCard | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const [cardsResult, profileResult] = await Promise.all([
          getCreditCards(user.uid),
          getUserProfile(user.uid),
        ]);

        if (cardsResult.success && cardsResult.data) {
          setCards(cardsResult.data);
        }

        if (profileResult.success && profileResult.data) {
          setOverdraftRate(profileResult.data.overdraft_rate);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        toast.error("Erro ao carregar configurações");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleSaveOverdraftRate = async () => {
    if (!user) return;

    try {
      const result = await updateUserProfile(user.uid, {
        overdraftRate,
      });

      if (result.success) {
        toast.success("Taxa de cheque especial atualizada!");
      } else {
        toast.error(result.error || "Erro ao salvar taxa");
      }
    } catch (error) {
      toast.error("Erro ao atualizar taxa");
    }
  };

  const handleAddCard = () => {
    setEditingCard({
      id: "",
      user_id: user?.uid || "",
      name: "",
      closing_day: 1,
      due_day: 10,
      isNew: true,
    });
  };

  const handleEditCard = (card: CreditCard) => {
    setEditingCard({ ...card });
  };

  const handleSaveCard = async () => {
    if (!user || !editingCard) return;

    try {
      if (editingCard.isNew) {
        const result = await createCreditCard({
          userId: user.uid,
          name: editingCard.name,
          closingDay: editingCard.closing_day,
          dueDay: editingCard.due_day,
        });

        if (result.success && result.id) {
          setCards([
            ...cards,
            {
              id: result.id,
              user_id: user.uid,
              name: editingCard.name,
              closing_day: editingCard.closing_day,
              due_day: editingCard.due_day,
            },
          ]);
          toast.success("Cartão adicionado com sucesso!");
        } else {
          toast.error(result.error || "Erro ao adicionar cartão");
        }
      } else {
        const result = await updateCreditCard(editingCard.id, {
          name: editingCard.name,
          closingDay: editingCard.closing_day,
          dueDay: editingCard.due_day,
        });

        if (result.success) {
          setCards(
            cards.map((c) =>
              c.id === editingCard.id
                ? {
                    ...c,
                    name: editingCard.name,
                    closing_day: editingCard.closing_day,
                    due_day: editingCard.due_day,
                  }
                : c,
            ),
          );
          toast.success("Cartão atualizado com sucesso!");
        } else {
          toast.error(result.error || "Erro ao atualizar cartão");
        }
      }

      setEditingCard(null);
    } catch (error) {
      toast.error("Erro ao salvar cartão");
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm("Deseja realmente excluir este cartão?")) return;

    try {
      const result = await deleteCreditCard(id);

      if (result.success) {
        setCards(cards.filter((c) => c.id !== id));
        toast.success("Cartão excluído com sucesso!");
      } else {
        toast.error(result.error || "Erro ao excluir cartão");
      }
    } catch (error) {
      toast.error("Erro ao excluir cartão");
    }
  };

  const handleExportCsv = async () => {
    if (!user) return;

    setExporting(true);
    try {
      const result = await exportTransactionsCsv(user.uid);

      if (result.success && result.csv) {
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `transacoes_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("Exportação concluída com sucesso!");
      } else {
        toast.error(result.error || "Erro ao exportar transações");
      }
    } catch (error) {
      toast.error("Erro ao exportar transações");
    } finally {
      setExporting(false);
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <SettingsIcon className="mx-auto h-12 w-12 text-orange-500" />
            <p className="mt-4 text-gray-600">Faça login para acessar as configurações</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
            <p className="mt-1 text-sm text-gray-600">
              Gerencie seus cartões e preferências
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>

        {/* Taxa de Cheque Especial */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2 text-orange-600">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Taxa de Cheque Especial
              </h2>
              <p className="text-sm text-gray-600">
                Usado para calcular o alerta de juros
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-gray-700">
                Taxa mensal (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={overdraftRate}
                onChange={(e) => setOverdraftRate(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 font-medium"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveOverdraftRate}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Salvar
            </button>
          </div>
        </section>

        {/* Cartões de Crédito */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                <CreditCardIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Cartões de Crédito
                </h2>
                <p className="text-sm text-gray-600">
                  Configure dias de fechamento e vencimento
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddCard}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : cards.length === 0 && !editingCard ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Nenhum cartão cadastrado
              </p>
            ) : (
              <>
                {cards.map((card) =>
                  editingCard?.id === card.id ? (
                    <div
                      key={card.id}
                      className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Nome do Cartão
                          </label>
                          <input
                            type="text"
                            value={editingCard.name}
                            onChange={(e) =>
                              setEditingCard({
                                ...editingCard,
                                name: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Dia de Fechamento
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={editingCard.closing_day}
                            onChange={(e) =>
                              setEditingCard({
                                ...editingCard,
                                closing_day: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Dia de Vencimento
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={editingCard.due_day}
                            onChange={(e) =>
                              setEditingCard({
                                ...editingCard,
                                due_day: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCard(null)}
                          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveCard}
                          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          <Save className="h-4 w-4" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={card.id}
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{card.name}</p>
                        <p className="text-sm text-gray-600">
                          Fecha dia {card.closing_day} • Vence dia {card.due_day}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditCard(card)}
                          className="rounded p-2 text-gray-600 hover:bg-gray-100"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="rounded p-2 text-red-600 hover:bg-red-50"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ),
                )}

                {editingCard?.isNew && (
                  <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Nome do Cartão
                        </label>
                        <input
                          type="text"
                          value={editingCard.name}
                          onChange={(e) =>
                            setEditingCard({
                              ...editingCard,
                              name: e.target.value,
                            })
                          }
                          placeholder="Ex: Nubank Platinum"
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Dia de Fechamento
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editingCard.closing_day}
                          onChange={(e) =>
                            setEditingCard({
                              ...editingCard,
                              closing_day: Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Dia de Vencimento
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editingCard.due_day}
                          onChange={(e) =>
                            setEditingCard({
                              ...editingCard,
                              due_day: Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 font-medium"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCard(null)}
                        className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCard}
                        disabled={!editingCard.name}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
