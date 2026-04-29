import { Activity, ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, ChevronLeft, ChevronRight, Home, ScrollText, CreditCard, Landmark } from "lucide-react";
import DashboardCharts from "./components/DashboardCharts";
import TransactionList from "./components/TransactionList";
import AllTransactions from "./components/AllTransactions";
import BudgetModule from "./components/BudgetModule";
import { type Transaction } from "./types";
import { useMemo, useState } from "react";
import { format, isSameMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import AuthModule from "./components/AuthModule";
import CardsModule from "./components/CardsModule";
import BanksModule from "./components/BanksModule";
import { LogOut } from "lucide-react";
import { useEffect } from "react";
import TransactionDetailDrawer from "./components/TransactionDetailDrawer";
import PWABadge from "./components/PWABadge";




export default function App() {
  const [user, setUser] = useState<{ id: number; name: string; whatsapp: string } | null>(() => {
    const saved = localStorage.getItem("financeUser");
    if (saved) return JSON.parse(saved);
    return null;
  });

  useEffect(() => {
    if (user) localStorage.setItem("financeUser", JSON.stringify(user));
    else localStorage.removeItem("financeUser");
  }, [user]);

  const [transactionsData, setTransactionsData] = useState<Transaction[]>([]);
  const [activeView, setActiveView] = useState<"home" | "transactions" | "cards" | "banks" | "budget">("home");
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3));
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleTransactionClick = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setIsDrawerOpen(true);
  };

  const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

  useEffect(() => {
    if (user) {
      fetch(`/api/transactions/${user.whatsapp}`)
        .then(res => res.json())
        .then(data => {
          // Garantir que amount seja número e tratar datas
          const formattedData = Array.isArray(data) ? data.map((tx: any) => ({
            ...tx,
            amount: Number(tx.amount) || 0,
            date: tx.date || new Date().toISOString()
          })) : [];
          setTransactionsData(formattedData);
        })
        .catch(err => console.error("Erro ao buscar transações:", err));
    }
  }, [user]);

  const transactions = useMemo(() => {
    return transactionsData.filter(tx => isSameMonth(parseISO(tx.date.toString()), currentDate));
  }, [transactionsData, currentDate]);

  const stats = useMemo(() => {
    return transactions.reduce(
      (acc, curr) => {
        const amount = Number(curr.amount) || 0;
        if (curr.type === "income") {
          acc.totalIncome += amount;
        } else {
          acc.totalExpense += amount;
          if (curr.category === "Essencial") acc.essencial += amount;
          else if (curr.category === "Importante") acc.importante += amount;
          else if (curr.category === "Supérfluo") acc.superfluo += amount;
        }
        acc.balance = acc.totalIncome - acc.totalExpense;
        return acc;
      },
      { balance: 0, totalIncome: 0, totalExpense: 0, essencial: 0, importante: 0, superfluo: 0 }
    );
  }, [transactions]);

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto min-h-screen bg-[var(--color-bg)]">
        <AuthModule onLogin={setUser} />
      </div>
    );
  }



  const renderContent = () => {
    switch (activeView) {
      case "home":
        return (
          <>
            {/* Header / Balance Section */}
            <header className="px-6 pt-8 pb-4">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#EEE] rounded-[50%] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
                    <img 
                      src={`https://ui-avatars.com/api/?name=${user.name}&background=111827&color=fff`} 
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[12px] text-[var(--color-text-muted)] leading-tight">Olá, {user.name.split(' ')[0]}</p>
                    <p className="text-[14px] font-[700] leading-tight">Bem-vindo</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setUser(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                    title="Sair"
                  >
                    <LogOut size={16} />
                  </button>
                  <div className="flex items-center gap-1 text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded-full px-2 py-1">
                  <button onClick={handlePrevMonth} className="p-1 hover:text-gray-900 transition-colors">
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                  <div className="text-[12px] font-[600] uppercase tracking-[1px] min-w-[80px] text-center">
                    {format(currentDate, "MMM yyyy", { locale: ptBR })}
                  </div>
                  <button onClick={handleNextMonth} className="p-1 hover:text-gray-900 transition-colors">
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 to-black rounded-[24px] p-6 text-white shadow-xl shadow-gray-200/50 mb-8 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                <p className="text-[14px] text-gray-400 mb-1 font-medium">Saldo Disponível</p>
                <h1 className="text-[36px] font-[800] tracking-[-1px] flex items-baseline gap-1">
                  <span className="text-[20px] font-medium text-gray-400">R$</span>
                  {stats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h1>
                
                <div className="flex gap-4 mt-6 pt-6 border-t border-white/10">
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-1">Entradas</p>
                    <p className="text-[15px] font-bold text-emerald-400">
                      + R$ {stats.totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-[1px] bg-white/10" />
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-1">Saídas</p>
                    <p className="text-[15px] font-bold text-rose-400">
                      - R$ {stats.totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <DashboardCharts transactions={transactions} />
              </div>
            </header>

            {/* Main Content Area */}
            <main className="px-6 space-y-6">
              {/* Charts & Analysis */}
              <section>
                <div className="bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-[16px] font-[700] text-gray-900">Análise de Gastos</h2>
                    <div className="px-3 py-1 bg-gray-50 rounded-full text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      {transactions.length} transações
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="h-[20px] bg-gray-100 rounded-full overflow-hidden flex w-full p-1">
                      {stats.totalExpense > 0 ? (
                        <>
                          <div 
                            className="h-full bg-rose-700 transition-all duration-700 ease-out rounded-full" 
                            style={{ 
                              width: `${(stats.essencial / stats.totalExpense) * 100}%`,
                              minWidth: stats.essencial > 0 ? '4px' : '0'
                            }}
                            title="Essencial"
                          />
                          <div 
                            className="h-full bg-rose-500 transition-all duration-700 ease-out rounded-full -ml-1" 
                            style={{ 
                              width: `${(stats.importante / stats.totalExpense) * 100}%`,
                              minWidth: stats.importante > 0 ? '4px' : '0'
                            }}
                            title="Importante"
                          />
                          <div 
                            className="h-full bg-rose-300 transition-all duration-700 ease-out rounded-full -ml-1" 
                            style={{ 
                              width: `${(stats.superfluo / stats.totalExpense) * 100}%`,
                              minWidth: stats.superfluo > 0 ? '4px' : '0'
                            }}
                            title="Supérfluo"
                          />
                        </>
                      ) : (
                        <div className="h-full bg-gray-200 w-full rounded-full" />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                       <div className="space-y-1">
                         <div className="flex items-center gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-rose-700" />
                           <span className="text-[10px] uppercase font-bold text-gray-500">Essencial</span>
                         </div>
                         <p className="text-[13px] font-bold text-gray-900">
                           {((stats.essencial / (stats.totalExpense || 1)) * 100).toFixed(0)}%
                         </p>
                       </div>
                       <div className="space-y-1 text-center">
                         <div className="flex items-center justify-center gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-rose-500" />
                           <span className="text-[10px] uppercase font-bold text-gray-500">Importante</span>
                         </div>
                         <p className="text-[13px] font-bold text-gray-900">
                           {((stats.importante / (stats.totalExpense || 1)) * 100).toFixed(0)}%
                         </p>
                       </div>
                       <div className="space-y-1 text-right">
                         <div className="flex items-center justify-end gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-rose-300" />
                           <span className="text-[10px] uppercase font-bold text-gray-500">Supérfluo</span>
                         </div>
                         <p className="text-[13px] font-bold text-gray-900">
                           {((stats.superfluo / (stats.totalExpense || 1)) * 100).toFixed(0)}%
                         </p>
                       </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Planejamento & Orcamento Teaser */}
              <section>
                <div className="flex justify-between items-center pb-3">
                  <h2 className="text-[16px] font-[700]">Planejamento</h2>
                  <button
                    onClick={() => setActiveView("budget")}
                    className="text-[12px] font-[600] text-[var(--color-primary)] hover:underline transition-all"
                  >
                    Configurar
                  </button>
                </div>
                <div
                  onClick={() => setActiveView("budget")}
                  className="cursor-pointer bg-[var(--color-bg)] rounded-[16px] p-4 border border-[var(--color-border)] flex items-center justify-between transition-colors hover:shadow-sm"
                >
                  <div>
                    <p className="text-[14px] font-[600] text-[var(--color-text-main)]">Orçamento & Reserva</p>
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-1">Regra 50/30/20 e Fundo de Emergência</p>
                  </div>
                  <ChevronRight size={20} className="text-[var(--color-text-muted)]" />
                </div>
              </section>

              {/* Recent Transactions List */}
              <section>
                <div className="flex justify-between items-center pb-3">
                  <h2 className="text-[16px] font-[700]">Atividade Recente</h2>
                  <button 
                    onClick={() => setActiveView("transactions")}
                    className="text-[12px] font-[500] text-[var(--color-text-muted)] hover:text-gray-900 transition-colors"
                  >
                    Ver tudo
                  </button>
                </div>
                <TransactionList 
                  transactions={transactions} 
                  onTransactionClick={handleTransactionClick}
                />
              </section>
            </main>
          </>
        );
      case "transactions":
        return (
          <div className="pt-2">
            <AllTransactions 
              transactions={transactionsData} 
              onBack={() => setActiveView("home")} 
              onTransactionClick={handleTransactionClick}
            />
          </div>
        );
      case "budget":
        return (
          <BudgetModule 
            transactions={transactions} 
            onBack={() => setActiveView("home")} 
          />
        );
      case "cards":
        return (
          <CardsModule 
            whatsapp={user.whatsapp} 
            onBack={() => setActiveView("home")} 
          />
        );
      case "banks":
        return (
          <BanksModule 
            whatsapp={user.whatsapp} 
            onBack={() => setActiveView("home")} 
          />
        );
    }
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[var(--color-card)] text-[var(--color-text-main)] pb-[100px] relative overflow-x-hidden">
      {renderContent()}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/80 backdrop-blur-lg border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <button 
          onClick={() => setActiveView("home")}
          className={`flex flex-col items-center gap-1 transition-all ${activeView === "home" ? "text-black" : "text-gray-400 hover:text-gray-600"}`}
        >
          <Home size={22} strokeWidth={activeView === "home" ? 3 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
        </button>
        
        <button 
          onClick={() => setActiveView("transactions")}
          className={`flex flex-col items-center gap-1 transition-all ${activeView === "transactions" ? "text-black" : "text-gray-400 hover:text-gray-600"}`}
        >
          <ScrollText size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Extrato</span>
        </button>

        <div className="relative -mt-10">
          <button className="w-14 h-14 bg-black rounded-full flex items-center justify-center text-white shadow-lg shadow-black/20 hover:scale-110 active:scale-95 transition-all">
            <Plus size={28} />
          </button>
        </div>

        <button 
          onClick={() => setActiveView("cards")}
          className={`flex flex-col items-center gap-1 transition-all ${activeView === "cards" ? "text-black" : "text-gray-400 hover:text-gray-600"}`}
        >
          <CreditCard size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Cartões</span>
        </button>

        <button 
          onClick={() => setActiveView("banks")}
          className={`flex flex-col items-center gap-1 transition-all ${activeView === "banks" ? "text-black" : "text-gray-400 hover:text-gray-600"}`}
        >
          <Landmark size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Bancos</span>
        </button>
      </nav>

      <TransactionDetailDrawer 
        transaction={selectedTransaction}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onDelete={(id) => {
          setTransactionsData(prev => prev.filter(tx => tx.id !== id));
          setIsDrawerOpen(false);
        }}
        onUpdate={async (id, updates) => {
          try {
            const res = await fetch(`/api/transactions/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            if (res.ok) {
              const updatedTx = await res.json();
              setTransactionsData(prev => prev.map(tx => tx.id === id ? { ...tx, ...updatedTx, amount: Number(updatedTx.amount) } : tx));
              setIsDrawerOpen(false);
            }
          } catch (err) {
            console.error("Erro ao atualizar:", err);
          }
        }}
      />
      <PWABadge />

    </div>
  );
}
