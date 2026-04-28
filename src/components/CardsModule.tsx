import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, CreditCard, Calendar, ShieldCheck, ChevronRight, X, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface Card {
  id: number;
  card_name: string;
  closing_day: number;
  due_day: number;
  limit_amount: number | null;
  notes: string | null;
}

interface CardsModuleProps {
  whatsapp: string;
  onBack: () => void;
}

export default function CardsModule({ whatsapp, onBack }: CardsModuleProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    card_name: "",
    closing_day: 1,
    due_day: 10,
    limit_amount: "",
    notes: ""
  });

  const fetchCards = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/cards/${whatsapp}`);
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar cartões:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, [whatsapp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp,
          ...formData,
          limit_amount: formData.limit_amount ? parseFloat(formData.limit_amount) : null
        }),
      });
      
      if (res.ok) {
        await fetchCards();
        setIsModalOpen(false);
        setFormData({ card_name: "", closing_day: 1, due_day: 10, limit_amount: "", notes: "" });
      }
    } catch (err) {
      console.error("Erro ao salvar cartão:", err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="px-6 pt-8 pb-6 bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors">
              <ArrowLeft size={24} className="text-gray-900" />
            </button>
            <h1 className="text-[20px] font-bold text-gray-900">Meus Cartões</h1>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="px-6 pt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white rounded-[32px] border border-gray-100 shadow-sm">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard size={32} className="text-gray-300" />
            </div>
            <h3 className="text-[16px] font-bold text-gray-900 mb-1">Nenhum cartão cadastrado</h3>
            <p className="text-[14px] text-gray-500 mb-6">Adicione seus cartões para que a Donna possa gerenciar suas faturas.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-[14px] hover:bg-gray-800 transition-colors"
            >
              Adicionar Primeiro Cartão
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={card.id}
                className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm relative overflow-hidden group"
              >
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-inner">
                      <CreditCard size={24} />
                    </div>
                    <div>
                      <h3 className="text-[18px] font-bold text-gray-900">{card.card_name}</h3>
                      <p className="text-[12px] text-gray-400 font-medium">Crédito</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-[12px] font-bold text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Ativo</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Fechamento</p>
                    <p className="text-[14px] font-bold text-gray-800">Dia {card.closing_day}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Vencimento</p>
                    <p className="text-[14px] font-bold text-gray-800">Dia {card.due_day}</p>
                  </div>
                </div>

                {card.limit_amount && (
                  <div className="mt-4 pt-4 border-t border-gray-50">
                     <div className="flex justify-between items-center">
                        <p className="text-[12px] text-gray-500 font-medium">Limite Total</p>
                        <p className="text-[14px] font-bold text-gray-900">R$ {Number(card.limit_amount).toLocaleString('pt-BR')}</p>
                     </div>
                  </div>
                )}

                {card.notes && (
                  <div className="mt-3 flex items-start gap-2 text-[12px] text-gray-400 italic">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p>"{card.notes}"</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-8 p-6 bg-blue-50/50 rounded-[32px] border border-blue-100 flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-blue-900 mb-1">Assistência Donna</h4>
            <p className="text-[12px] text-blue-700 leading-relaxed">
              A Donna usa o dia de fechamento para sugerir o melhor dia de compra e calcular automaticamente em qual fatura seus lançamentos cairão.
            </p>
          </div>
        </div>
      </main>

      {/* Add Card Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[32px] z-[61] shadow-2xl p-6 pb-12"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[20px] font-bold text-gray-900">Novo Cartão</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 rounded-full text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Cartão</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Nubank Violeta"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] focus:ring-2 focus:ring-black outline-none transition-all"
                    value={formData.card_name}
                    onChange={e => setFormData(f => ({ ...f, card_name: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Fechamento</label>
                    <input 
                      type="number" 
                      min="1" max="31"
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                      value={formData.closing_day}
                      onChange={e => setFormData(f => ({ ...f, closing_day: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Vencimento</label>
                    <input 
                      type="number" 
                      min="1" max="31"
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                      value={formData.due_day}
                      onChange={e => setFormData(f => ({ ...f, due_day: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Limite (Opcional)</label>
                  <input 
                    type="number" 
                    placeholder="Ex: 5000"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                    value={formData.limit_amount}
                    onChange={e => setFormData(f => ({ ...f, limit_amount: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Dicas para a Donna (Opcional)</label>
                  <textarea 
                    placeholder="Ex: Use este cartão apenas para viagens ou compras grandes."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] outline-none min-h-[100px] resize-none"
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-black text-white py-4 rounded-2xl font-bold text-[16px] shadow-lg shadow-black/10 active:scale-95 transition-all"
                >
                  Salvar Cartão
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
