export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  date: string | Date;
  description: string;
  whatsapp?: string;
  estabelecimento?: string;
  timezone_usuario?: string;
  detalhes?: string;
  created_at?: string | Date;
}

export interface DashboardStats {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}
