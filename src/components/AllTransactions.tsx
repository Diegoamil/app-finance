import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { type Transaction } from "../types";
import TransactionList from "./TransactionList";

interface AllTransactionsProps {
  transactions: Transaction[];
  onBack: () => void;
}

export default function AllTransactions({ transactions, onBack }: AllTransactionsProps) {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    return tx.type === filter;
  });

  return (
    <div className="w-full min-h-screen bg-[var(--color-card)] pb-24">
      {/* Header */}
      <header className="px-6 pt-8 pb-6 bg-[var(--color-card)] sticky top-0 z-10 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-bg)] transition-colors"
          >
            <ArrowLeft size={24} className="text-[var(--color-text-main)]" />
          </button>
          <h1 className="text-[20px] font-[700] text-[var(--color-text-main)]">Todas as Transações</h1>
        </div>
      </header>

      <main className="px-6 pt-6 space-y-6">
        {/* Filter Tabs */}
        <div className="flex bg-[var(--color-bg)] p-1 rounded-xl">
          <button 
            onClick={() => setFilter("all")}
            className={`flex-1 text-sm font-medium py-2 px-4 rounded-lg transition-all ${
              filter === "all" 
                ? "bg-[var(--color-card)] shadow-sm text-[var(--color-text-main)]" 
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            }`}
          >
            Tudo
          </button>
          <button 
            onClick={() => setFilter("income")}
            className={`flex-1 text-sm font-medium py-2 px-4 rounded-lg transition-all ${
              filter === "income" 
                ? "bg-[var(--color-card)] shadow-sm text-[var(--color-text-main)]" 
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            }`}
          >
            Receitas
          </button>
          <button 
            onClick={() => setFilter("expense")}
            className={`flex-1 text-sm font-medium py-2 px-4 rounded-lg transition-all ${
              filter === "expense" 
                ? "bg-[var(--color-card)] shadow-sm text-[var(--color-text-main)]" 
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            }`}
          >
            Despesas
          </button>
        </div>

        {/* Transactions List */}
        <TransactionList transactions={filteredTransactions} />
        
        {filteredTransactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-[14px] text-[var(--color-text-muted)] font-[500]">Nenhuma transação encontrada</p>
          </div>
        )}
      </main>
    </div>
  );
}
