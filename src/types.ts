export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: "Essencial" | "Importante" | "Supérfluo" | "Receita";
  date: string;
  description: string;
}

export interface DashboardStats {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}
