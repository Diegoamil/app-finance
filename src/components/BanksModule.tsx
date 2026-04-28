import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Landmark, Wallet, ChevronRight, X, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BankAccount {
  id: number;
  bank_name: string;
  initial_balance: number;
  current_balance: number;
}

interface BanksModuleProps {
  whatsapp: string;
  onBack: () => void;
}

export default function BanksModule({ whatsapp, onBack }: BanksModuleProps) {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    bank_name: "",
    initial_balance: ""
  });

  const fetchBanks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/banks/${whatsapp}`);
      const data = await res.json();
      setBanks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar bancos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, [whatsapp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp,
          ...formData
        }),
      });
      
      if (res.ok) {
        await fetchBanks();
        setIsModalOpen(false);
        setFormData({ bank_name: "", initial_balance: "" });
      }
    } catch (err) {
      console.error("Erro ao salvar banco:", err);
    }
  };

  const totalBalance = banks.reduce((acc, bank) => acc + Number(bank.current_balance), 0);

  return (
    <div className="w-full min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="px-6 pt-8 pb-6 bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors">
              <ArrowLeft size={24} className="text-gray-900" />
            </button>
            <h1 className="text-[20px] font-bold text-gray-900">Minhas Contas</h1>
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
        {/* Total Liquidity Card */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] p-6 text-white shadow-xl mb-8">
          <p className="text-[12px] text-blue-100 font-bold uppercase tracking-wider mb-1">Liquidez Total</p>
          <h2 className="text-[32px] font-extrabold">
            R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h2>
          <div className="mt-4 flex items-center gap-2 text-[12px] text-blue-100">
            <Info size={14} />
            <p>Soma de todos os saldos em conta</p>
          </div>
        </div>

        <h3 className="text-[14px] font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Instituições</h3>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : banks.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white rounded-[32px] border border-gray-100 shadow-sm">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Landmark size={32} className="text-gray-300" />
            </div>
            <h3 className="text-[16px] font-bold text-gray-900 mb-1">Nenhum banco conectado</h3>
            <p className="text-[14px] text-gray-500 mb-6">Cadastre seus bancos para gerenciar transferências e saldos.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-[14px] hover:bg-gray-800 transition-colors"
            >
              Adicionar Conta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {banks.map((bank) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={bank.id}
                className="bg-white rounded-[24px] p-4 border border-gray-100 shadow-sm flex items-center justify-between group active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 group-hover:bg-black group-hover:text-white transition-all">
                    <Landmark size={24} />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-gray-900">{bank.bank_name}</h3>
                    <p className="text-[12px] text-gray-400">Conta Corrente</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[16px] font-bold text-gray-900">
                    R$ {Number(bank.current_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Saldo Atual</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-8 p-6 bg-amber-50 rounded-[32px] border border-amber-100 flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
            <Wallet size={20} />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-amber-900 mb-1">Dica da Donna</h4>
            <p className="text-[12px] text-amber-700 leading-relaxed">
              Ao registrar uma transferência via WhatsApp, como "Mandei 500 do Nubank pro Itaú", eu atualizo automaticamente os saldos de ambas as contas para você.
            </p>
          </div>
        </div>
      </main>

      {/* Add Bank Modal */}
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
                <h2 className="text-[20px] font-bold text-gray-900">Nova Conta</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 rounded-full text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Instituição</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Nubank, Itaú, Bradesco"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] focus:ring-2 focus:ring-black outline-none transition-all"
                    value={formData.bank_name}
                    onChange={e => setFormData(f => ({ ...f, bank_name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">Saldo Inicial</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="Quanto você tem nesta conta hoje?"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                    value={formData.initial_balance}
                    onChange={e => setFormData(f => ({ ...f, initial_balance: e.target.value }))}
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-black text-white py-4 rounded-2xl font-bold text-[16px] shadow-lg shadow-black/10 active:scale-95 transition-all"
                >
                  Confirmar Saldo
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
