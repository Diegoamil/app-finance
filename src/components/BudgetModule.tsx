import React, { useState, useMemo } from "react";
import { ArrowLeft, Target, ShieldAlert, Edit2 } from "lucide-react";
import { type Transaction } from "../types";

interface BudgetModuleProps {
  transactions: Transaction[];
  onBack: () => void;
}

export default function BudgetModule({ transactions, onBack }: BudgetModuleProps) {
  // Calculando com base no mês atual (ou do filtro passado)
  const currentMonthIncome = useMemo(() => 
    transactions.filter(t => t.type === "income").reduce((acc, t) => acc + t.amount, 0),
  [transactions]);

  const currentMonthEssenciais = useMemo(() => 
    transactions.filter(t => t.type === "expense" && t.category === "Essencial").reduce((acc, t) => acc + t.amount, 0),
  [transactions]);

  const currentMonthSuperfluos = useMemo(() => 
    transactions.filter(t => t.type === "expense" && t.category === "Supérfluo").reduce((acc, t) => acc + t.amount, 0),
  [transactions]);

  const currentMonthImportantes = useMemo(() => 
    transactions.filter(t => t.type === "expense" && t.category === "Importante").reduce((acc, t) => acc + t.amount, 0),
  [transactions]);

  // Simulador de Orçamento
  const [expectedIncome, setExpectedIncome] = useState<number>(currentMonthIncome || 5000);
  const [isEditingIncome, setIsEditingIncome] = useState(false);

  // Regra 50/30/20 Metas
  const goalEssenciais = expectedIncome * 0.5;
  const goalSuperfluos = expectedIncome * 0.3;
  const goalImportantes = expectedIncome * 0.2;

  // Calculadora de Reserva
  const [currentSavings, setCurrentSavings] = useState<number>(850); // Mock amount already saved
  const [isEditingSavings, setIsEditingSavings] = useState(false);
  const reserveGoal = currentMonthEssenciais > 0 ? currentMonthEssenciais : goalEssenciais; // Baseado no essencial gasto
  const reservePercentage = reserveGoal > 0 ? (currentSavings / reserveGoal) * 100 : 0;

  const BudgetBar = ({ label, actual, limit, colorHex }: { label: string, actual: number, limit: number, colorHex: string }) => {
    const percentage = limit > 0 ? (actual / limit) * 100 : 0;
    const isOver = percentage > 100;
    const barColor = isOver ? "var(--color-expense)" : colorHex;

    return (
      <div className="mb-4">
        <div className="flex justify-between items-end mb-2">
          <span className="text-[13px] font-[600] text-[var(--color-text-main)]">{label}</span>
          <span className="text-[12px] font-[500] text-[var(--color-text-muted)]">
            R$ {actual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / R$ {limit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="h-[8px] bg-[var(--color-border)] rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }}
          />
        </div>
        {isOver && (
          <p className="mt-[6px] text-[11px] font-[600] text-[var(--color-expense)] flex items-center gap-1">
             <ShieldAlert size={12} /> Alerta: Gasto atingiu {percentage.toFixed(0)}% da meta!
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-[var(--color-bg)] pb-24">
      {/* Header */}
      <header className="px-6 pt-8 pb-6 bg-[var(--color-card)] sticky top-0 z-10 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-bg)] transition-colors"
          >
            <ArrowLeft size={24} className="text-[var(--color-text-main)]" />
          </button>
          <div>
            <h1 className="text-[20px] font-[700] text-[var(--color-text-main)] leading-tight">Orçamento & Reserva</h1>
            <p className="text-[12px] text-[var(--color-text-muted)]">Planeje seu próximo mês</p>
          </div>
        </div>
      </header>

      <main className="px-6 pt-6 space-y-6">
        {/* Simulador Base Zero */}
        <section className="bg-[var(--color-card)] rounded-[20px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-[var(--color-border)]/50">
          <div className="flex flex-col mb-6 pb-4 border-b border-[var(--color-border)]">
            <h2 className="text-[16px] font-[700] flex items-center gap-2 mb-1">
              <Target size={18} className="text-[var(--color-primary)]"/>
              Simulador Base Zero
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)] mb-4">Aplica a regra 50/30/20 automaticamente sobre a sua renda prevista.</p>
            
            <div className="bg-[var(--color-bg)] rounded-[12px] p-3 flex justify-between items-center">
              <div>
                <p className="text-[11px] font-[600] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Renda Prevista (Mês Seguinte)</p>
                {isEditingIncome ? (
                  <input 
                    type="number" 
                    value={expectedIncome}
                    onChange={(e) => setExpectedIncome(Number(e.target.value))}
                    onBlur={() => setIsEditingIncome(false)}
                    autoFocus
                    className="w-[120px] bg-transparent text-[18px] font-[700] outline-none border-b border-[var(--color-border)]"
                  />
                ) : (
                  <p className="text-[18px] font-[700] text-[var(--color-revenue)]">
                    R$ {expectedIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setIsEditingIncome(!isEditingIncome)}
                className="w-8 h-8 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
              >
                <Edit2 size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <BudgetBar 
              label="Essenciais (50% da renda)" 
              actual={currentMonthEssenciais} 
              limit={goalEssenciais} 
              colorHex="#3B82F6" 
            />
            <BudgetBar 
              label="Supérfluos (30% da renda)" 
              actual={currentMonthSuperfluos} 
              limit={goalSuperfluos} 
              colorHex="#F59E0B" 
            />
            <BudgetBar 
              label="Importantes & Inv. (20% da renda)" 
              actual={currentMonthImportantes} 
              limit={goalImportantes} 
              colorHex="#8B5CF6" 
            />
          </div>
        </section>

        {/* Calculadora Reserva Mínima */}
        <section className="bg-[var(--color-card)] rounded-[20px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-[var(--color-border)]/50">
           <div className="mb-4">
              <h2 className="text-[16px] font-[700] flex items-center gap-2 mb-1">
                <ShieldAlert size={18} className="text-[#F59E0B]" />
                Reserva de Emergência
              </h2>
              <p className="text-[12px] text-[var(--color-text-muted)]">
                Baseado nos seus gastos <strong>essenciais reais</strong>, este é o mínimo que você precisa ter guardado para 1 mês de respiro.
              </p>
           </div>

           <div className="bg-[#FFFBEB] border border-[#FEF3C7] rounded-[16px] p-4 text-center mb-5">
              <p className="text-[11px] font-[600] text-[#D97706] uppercase tracking-wider mb-1">Meta Mínima (1 Mês Essencial)</p>
              <h3 className="text-[24px] font-[800] tracking-tight text-[#92400E]">
                 R$ {reserveGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
           </div>

           {/* Personal Progress */}
           <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[13px] font-[600] text-[var(--color-text-main)]">Seu Patrimônio Adicionado</span>
                {isEditingSavings ? (
                  <input 
                    type="number" 
                    value={currentSavings}
                    onChange={(e) => setCurrentSavings(Number(e.target.value))}
                    onBlur={() => setIsEditingSavings(false)}
                    autoFocus
                    className="w-[80px] bg-transparent text-[12px] font-[600] outline-none border-b border-[var(--color-border)] text-right"
                  />
                ) : (
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsEditingSavings(true)}>
                    <span className="text-[12px] font-[600] text-[var(--color-text-main)]">
                      R$ {currentSavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <Edit2 size={12} className="text-[var(--color-text-muted)]" />
                  </div>
                )}
              </div>
              <div className="h-[12px] bg-[var(--color-border)] rounded-full overflow-hidden mb-2 relative">
                <div 
                  className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-[#FCD34D] to-[#F59E0B]"
                  style={{ width: `${Math.min(reservePercentage, 100)}%` }}
                />
              </div>
              <p className="text-[11px] font-[500] text-[var(--color-text-muted)] text-center">
                Você já alcançou {reservePercentage.toFixed(1)}% da sua meta básica.
              </p>
           </div>
        </section>
      </main>
    </div>
  );
}
