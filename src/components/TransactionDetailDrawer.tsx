import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Calendar, Tag, MapPin, Trash2, Edit3 } from "lucide-react";
import { type Transaction } from "../types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../lib/utils";

interface TransactionDetailDrawerProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: { amount: number; category: string }) => void;
}

export default function TransactionDetailDrawer({ 
  transaction, 
  isOpen, 
  onClose,
  onDelete,
  onUpdate 
}: TransactionDetailDrawerProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedAmount, setEditedAmount] = React.useState("");
  const [editedCategory, setEditedCategory] = React.useState("");

  React.useEffect(() => {
    if (transaction) {
      setEditedAmount(transaction.amount.toString());
      setEditedCategory(transaction.category);
      setIsEditing(false);
    }
  }, [transaction]);

  if (!transaction) return null;

  const handleSave = () => {
    onUpdate?.(transaction.id, {
      amount: parseFloat(editedAmount),
      category: editedCategory
    });
    setIsEditing(false);
  };

  const categories = ["Essencial", "Importante", "Supérfluo", "Outros"];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-[2px]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[32px] z-[101] shadow-2xl overflow-hidden pb-safe"
          >
            {/* Handle */}
            <div className="w-full flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-6 py-4 flex justify-between items-start">
              <div className="flex-1">
                <p className={cn(
                  "text-[12px] font-bold uppercase tracking-wider mb-1",
                  transaction.type === "income" ? "text-emerald-500" : "text-rose-500"
                )}>
                  {transaction.type === "income" ? "Receita" : "Despesa"}
                </p>
                <h2 className="text-[22px] font-bold text-gray-900 leading-tight">
                  {transaction.estabelecimento || transaction.description}
                </h2>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Amount Section */}
            <div className="px-6 py-6 bg-gray-50/50 border-y border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1">Valor Total</p>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[24px] font-extrabold text-gray-400">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        autoFocus
                        className="text-[32px] font-extrabold tracking-tight bg-transparent border-b-2 border-black outline-none w-full"
                        value={editedAmount}
                        onChange={(e) => setEditedAmount(e.target.value)}
                      />
                    </div>
                  ) : (
                    <p className={cn(
                      "text-[32px] font-extrabold tracking-tight",
                      transaction.type === "income" ? "text-emerald-600" : "text-gray-900"
                    )}>
                      {transaction.type === "income" ? "+" : "-"} R$ {Number(transaction.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                {!isEditing && (
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                    <Tag size={24} className="text-gray-300" />
                  </div>
                )}
              </div>
            </div>

            {/* Details List */}
            <div className="px-6 py-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                  <Calendar size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Data e Hora</p>
                  <p className="text-[14px] font-semibold text-gray-800">
                    {format(new Date(transaction.created_at || transaction.date), "dd 'de' MMMM '·' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                  <Tag size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Categoria</p>
                  {isEditing ? (
                    <select 
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-semibold text-gray-800 outline-none"
                      value={editedCategory}
                      onChange={(e) => setEditedCategory(e.target.value)}
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[14px] font-semibold text-gray-800">
                      {transaction.category}
                    </p>
                  )}
                </div>
              </div>

              {transaction.detalhes && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                    <Edit3 size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Observação</p>
                    <p className="text-[14px] font-medium text-gray-600 italic">
                      "{transaction.detalhes}"
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 pb-10 pt-4 flex flex-col gap-3">
              {isEditing ? (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="flex items-center justify-center gap-2 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-2xl font-bold text-[14px] transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex items-center justify-center gap-2 py-4 bg-black text-white rounded-2xl font-bold text-[14px] transition-all"
                  >
                    Salvar Alterações
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="flex items-center justify-center gap-2 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-2xl font-bold text-[14px] transition-all"
                  >
                    <Edit3 size={18} />
                    Editar
                  </button>
                  <button 
                    onClick={() => {
                       if (confirm("Tem certeza que deseja excluir esta transação?")) {
                         onDelete?.(transaction.id);
                         onClose();
                       }
                    }}
                    className="flex items-center justify-center gap-2 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl font-bold text-[14px] transition-all"
                  >
                    <Trash2 size={18} />
                    Excluir
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
