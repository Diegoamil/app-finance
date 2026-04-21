import { Activity, ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import DashboardCharts from "./components/DashboardCharts";
import TransactionList from "./components/TransactionList";
import AllTransactions from "./components/AllTransactions";
import BudgetModule from "./components/BudgetModule";
import { type Transaction } from "./types";
import { useMemo, useState } from "react";
import { format, isSameMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "1", type: "income", amount: 4500, category: "Receita", date: "2026-04-10", description: "Salário" },
  { id: "2", type: "expense", amount: 120, category: "Essencial", date: "2026-04-12", description: "Supermercado" },
  { id: "3", type: "expense", amount: 45, category: "Importante", date: "2026-04-13", description: "Uber Transporte" },
  { id: "4", type: "expense", amount: 80, category: "Supérfluo", date: "2026-04-15", description: "Cinema e Lazer" },
  { id: "5", type: "income", amount: 300, category: "Receita", date: "2026-04-16", description: "Projeto Freelance" },
  { id: "6", type: "expense", amount: 1500, category: "Essencial", date: "2026-04-01", description: "Aluguel Moradia" },
  { id: "7", type: "expense", amount: 60, category: "Supérfluo", date: "2026-04-17", description: "iFood Delivery" },
  { id: "8", type: "expense", amount: 35, category: "Essencial", date: "2026-04-05", description: "Conta de Internet" },
];

export default function App() {
  const [activeView, setActiveView] = useState<"dashboard" | "transactions" | "budget">("dashboard");
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3)); // Setup inicial em Abril 2026 (baseado nos mocks)

  const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

  const transactions = useMemo(() => {
    return MOCK_TRANSACTIONS.filter(tx => isSameMonth(parseISO(tx.date), currentDate));
  }, [currentDate]);

  const stats = useMemo(() => {
    return transactions.reduce(
      (acc, curr) => {
        if (curr.type === "income") {
          acc.totalIncome += curr.amount;
        } else {
          acc.totalExpense += curr.amount;
          if (curr.category === "Essencial") acc.essencial += curr.amount;
          if (curr.category === "Importante") acc.importante += curr.amount;
          if (curr.category === "Supérfluo") acc.superfluo += curr.amount;
        }
        acc.balance = acc.totalIncome - acc.totalExpense;
        return acc;
      },
      { balance: 0, totalIncome: 0, totalExpense: 0, essencial: 0, importante: 0, superfluo: 0 }
    );
  }, [transactions]);

  if (activeView === "transactions") {
    return (
      <div className="w-full max-w-md mx-auto min-h-screen bg-[var(--color-card)] text-[var(--color-text-main)] relative overflow-x-hidden">
        <AllTransactions 
          transactions={MOCK_TRANSACTIONS} 
          onBack={() => setActiveView("dashboard")} 
        />
      </div>
    );
  }

  if (activeView === "budget") {
    return (
      <div className="w-full max-w-md mx-auto min-h-screen bg-[var(--color-bg)] text-[var(--color-text-main)] relative overflow-x-hidden">
        <BudgetModule 
          transactions={transactions} 
          onBack={() => setActiveView("dashboard")} 
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[var(--color-card)] text-[var(--color-text-main)] pb-[100px] relative overflow-x-hidden">
      {/* Header / Balance Section */}
      <header className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EEE] rounded-[50%] border border-[var(--color-border)]"></div>
            <div>
              <p className="text-[12px] text-[var(--color-text-muted)] leading-tight">Olá, User</p>
              <p className="text-[14px] font-[700] leading-tight">Bem-vindo</p>
            </div>
          </div>
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

        <div>
          <p className="text-[14px] text-[var(--color-text-muted)] mb-1">Saldo Disponível</p>
          <h1 className="text-[32px] font-[800] tracking-[-1px]">
            R$ {stats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h1>
        </div>

        <div className="mt-6">
          <DashboardCharts transactions={transactions} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="px-6 space-y-6">
        {/* Charts & Analysis */}
        <section>
          <div className="flex justify-between items-center pb-3">
            <h2 className="text-[16px] font-[700]">Análise</h2>
          </div>
          <div className="bg-[var(--color-bg)] rounded-[16px] p-5">
            <div className="flex justify-between items-end mb-3">
              <div className="flex flex-col">
                <span className="text-[11px] font-[600] uppercase text-[var(--color-text-muted)] tracking-wider">Receitas</span>
                <span className="text-[14px] font-[700] text-[var(--color-revenue)] mt-[2px]">
                  + R$ {stats.totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-[600] uppercase text-[var(--color-text-muted)] tracking-wider">Despesas</span>
                <span className="text-[14px] font-[700] text-[var(--color-expense)] mt-[2px]">
                  - R$ {stats.totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="h-[12px] bg-[#E5E7EB] rounded-full overflow-hidden flex w-full">
                {/* Receitas (Verde) */}
                <div 
                  className="h-full bg-[var(--color-revenue)] transition-all duration-500" 
                  style={{ width: `${(stats.totalIncome + stats.totalExpense) === 0 ? 50 : (stats.totalIncome / (stats.totalIncome + stats.totalExpense)) * 100}%` }}
                />
                
                {/* Despesas Empilhadas (Tons de Vermelho) */}
                {stats.totalExpense > 0 ? (
                  <>
                    <div 
                      className="h-full bg-[#991B1B] transition-all duration-500 border-l border-white/25" 
                      style={{ width: `${(stats.essencial / (stats.totalIncome + stats.totalExpense)) * 100}%` }}
                      title="Essencial"
                    />
                    <div 
                      className="h-full bg-[#EF4444] transition-all duration-500 border-l border-white/25" 
                      style={{ width: `${(stats.importante / (stats.totalIncome + stats.totalExpense)) * 100}%` }}
                      title="Importante"
                    />
                    <div 
                      className="h-full bg-[#FCA5A5] transition-all duration-500 border-l border-white/25" 
                      style={{ width: `${(stats.superfluo / (stats.totalIncome + stats.totalExpense)) * 100}%` }}
                      title="Supérfluo"
                    />
                  </>
                ) : (
                  <div 
                    className="h-full bg-[var(--color-expense)] transition-all duration-500" 
                    style={{ width: `${(stats.totalIncome + stats.totalExpense) === 0 ? 50 : 0}%` }}
                  />
                )}
              </div>

              {/* Legenda de Despesas */}
              <div className="flex items-center justify-between gap-1 pt-2 border-t border-[var(--color-border)]">
                 <div className="flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-[2px] bg-[#991B1B]"></div>
                   <span className="text-[10px] uppercase tracking-wide font-[700] text-[var(--color-text-muted)] truncate">Essencial</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]"></div>
                   <span className="text-[10px] uppercase tracking-wide font-[700] text-[var(--color-text-muted)] truncate">Importante</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-[2px] bg-[#FCA5A5]"></div>
                   <span className="text-[10px] uppercase tracking-wide font-[700] text-[var(--color-text-muted)] truncate">Supérfluo</span>
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
          <TransactionList transactions={transactions} />
        </section>
      </main>

    </div>
  );
}
