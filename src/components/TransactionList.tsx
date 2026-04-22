import { 
  ShieldAlert, Briefcase, Coffee, HelpCircle, ArrowDownLeft, 
  ShoppingBag, Car, Heart, Plane, Utensils, Zap, Book, Play, 
  Gamepad, Smartphone, DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { type Transaction } from "../types";
import { cn } from "../lib/utils";

interface TransactionListProps {
  transactions: Transaction[];
}

const getCategoryConfig = (category: string, title: string = "") => {
  const text = (category + " " + title).toLowerCase();
  
  if (text.includes("essencial")) return { icon: ShieldAlert, color: "#3B82F6" };
  if (text.includes("importante")) return { icon: Briefcase, color: "#8B5CF6" };
  if (text.includes("superf") || text.includes("supérfluo")) return { icon: Coffee, color: "#F59E0B" };
  
  // Alimentação
  if (text.match(/alimenta|restaurante|comida|ifood|pizza|burger|café|lanche|padaria|subway|outback/)) 
    return { icon: Utensils, color: "#10B981" };
  
  // Compras & Mercado
  if (text.match(/compra|shopping|mercado|supermercado|carrefour|extra|atacado|loja/)) 
    return { icon: ShoppingBag, color: "#EC4899" };
  
  // Transporte
  if (text.match(/transporte|uber|99|táxi|carro|combustível|gasolina|estacionamento/)) 
    return { icon: Car, color: "#6366F1" };
  
  // Saúde
  if (text.match(/saúde|médico|farmácia|hospital|clinica|drogaria|exame/)) 
    return { icon: Heart, color: "#EF4444" };

  // Serviços & Contas
  if (text.match(/conta|luz|água|internet|telefone|celular|assinatura|zap/)) 
    return { icon: Zap, color: "#FBBF24" };

  // Lazer & Entretenimento
  if (text.match(/viagem|lazer|cinema|netflix|spotify|ingresso|steam|jogo|game/)) 
    return { icon: text.includes("game") || text.includes("jogo") ? Gamepad : Plane, color: "#06B6D4" };
  
  // Educação
  if (text.match(/educa|escola|curso|faculdade|livro/)) 
    return { icon: Book, color: "#8B5CF6" };

  // Geral / Dinheiro
  if (text.includes("salário") || text.includes("receita")) return { icon: DollarSign, color: "#10B981" };

  return { icon: HelpCircle, color: "#9CA3AF" };
};

const CategoryIcon = ({ category, type, title }: { category: string, type: "income" | "expense", title: string }) => {
  if (type === "income") {
    return <ArrowDownLeft size={20} className="text-[var(--color-revenue)]" />;
  }

  const { icon: Icon, color } = getCategoryConfig(category, title);
  return <Icon size={20} style={{ color }} />;
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
            <CategoryIcon 
              category={tx.category} 
              type={tx.type} 
              title={tx.estabelecimento || tx.description} 
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[14px] font-[700] text-[var(--color-text-main)] truncate leading-tight uppercase">
              {tx.estabelecimento || tx.description}
            </h4>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate mb-[4px] leading-tight">
              {tx.detalhes || tx.description}
            </p>
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
               <span 
                 className="px-2 py-[2px] rounded-full text-[10px] font-[600] uppercase tracking-wide"
                 style={{ 
                   backgroundColor: `${getCategoryConfig(tx.category, tx.estabelecimento || tx.description).color}15`, 
                   color: getCategoryConfig(tx.category, tx.estabelecimento || tx.description).color 
                 }}
               >
                 {tx.category}
               </span>
               <span className="opacity-50">•</span>
               <span>{format(new Date(tx.created_at || tx.date), "dd MMM · HH:mm", { locale: ptBR })}</span>
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
