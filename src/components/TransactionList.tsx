import { ShieldAlert, Briefcase, Coffee, HelpCircle, ArrowDownLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { type Transaction } from "../types";
import { cn } from "../lib/utils";

interface TransactionListProps {
  transactions: Transaction[];
}

const CategoryIcon = ({ category, type }: { category: string, type: "income" | "expense" }) => {
  if (type === "income") {
    return <ArrowDownLeft size={20} className="text-[var(--color-revenue)]" />;
  }

  switch (category.toLowerCase()) {
    case "essencial":
      return <ShieldAlert size={20} className="text-[#3B82F6]" />;
    case "importante":
      return <Briefcase size={20} className="text-[#8B5CF6]" />;
    case "supérfluo":
      return <Coffee size={20} className="text-[#F59E0B]" />;
    default:
      return <HelpCircle size={20} className="text-gray-500" />;
  }
};

export default function TransactionList({ transactions }: TransactionListProps) {
  // Sort by date descending
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center bg-[var(--color-card)] rounded-[16px] border border-dashed border-[var(--color-border)]">
        <p className="text-[14px] text-[var(--color-text-muted)] font-[500]">Nenhuma transação neste mês</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sorted.map((tx, idx) => (
        <div 
          key={tx.id} 
          className={cn(
            "flex items-center py-4",
            idx !== sorted.length - 1 && "border-b border-[var(--color-border)]"
          )}
        >
          <div className="w-[44px] h-[44px] rounded-[12px] bg-[#F3F4F6] flex items-center justify-center mr-3 shrink-0">
            <CategoryIcon category={tx.category} type={tx.type} />
          </div>
          <div className="flex-1">
            <h4 className="text-[14px] font-[600] text-[var(--color-text-main)] mb-[4px] leading-tight">{tx.description}</h4>
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
               <span className={cn(
                 "px-2 py-[2px] rounded-full text-[10px] font-[600] uppercase tracking-wide",
                 tx.category === "Essencial" ? "bg-[#EFF6FF] text-[#3B82F6]" : 
                 tx.category === "Importante" ? "bg-[#F5F3FF] text-[#8B5CF6]" : 
                 tx.category === "Supérfluo" ? "bg-[#FFFBEB] text-[#F59E0B]" :
                 "bg-[#ECFDF5] text-[var(--color-revenue)]"
               )}>
                 {tx.category}
               </span>
               <span className="opacity-50">•</span>
               <span>{format(new Date(tx.date), "dd MMM", { locale: ptBR })}</span>
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <p className={cn(
              "font-[700] text-[14px]",
              tx.type === "income" ? "text-[var(--color-revenue)]" : "text-[var(--color-expense)]"
            )}>
              {tx.type === "income" ? "+" : "-"} R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
