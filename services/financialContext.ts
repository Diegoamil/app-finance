/**
 * Financial Context Builder
 * Constrói o contexto financeiro do usuário para injetar nos prompts da Donna.
 */

import { Pool } from "pg";

// Será injetado pelo server.ts
let pool: Pool;

export function setPool(p: Pool) {
  pool = p;
}

/**
 * Pega todas as variações de número do WhatsApp (com/sem 55, com/sem nono dígito)
 */
function getWhatsappVariations(phone: string): string[] {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("55")) clean = clean.substring(2);

  const ddd = clean.substring(0, 2);
  const number = clean.substring(2);

  const with9 = number.length === 8 ? "9" + number : number;
  const without9 = number.length === 9 && number.startsWith("9") ? number.substring(1) : number;

  return [
    `55${ddd}${with9}`,
    `55${ddd}${without9}`,
    `${ddd}${with9}`,
    `${ddd}${without9}`,
    phone,
  ];
}

export interface MonthSummary {
  receitas: number;
  despesas: number;
  saldo: number;
  essenciais: number;
  importantes: number;
  superfluos: number;
  totalTransactions: number;
}

export interface TopExpense {
  estabelecimento: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

export interface MonthComparison {
  currentMonth: MonthSummary;
  previousMonth: MonthSummary;
  expenseChange: number; // percentual de mudança
  incomeChange: number;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface FinancialSnapshot {
  userName: string;
  summary: MonthSummary;
  topExpenses: TopExpense[];
  comparison: MonthComparison | null;
  categoryBreakdown: CategoryBreakdown[];
  daysRemaining: number;
  recentTransactions: TopExpense[];
}

/**
 * Busca o nome do usuário pelo WhatsApp
 */
export async function getUserByPhone(phone: string): Promise<{ id: number; name: string; whatsapp: string } | null> {
  const variations = getWhatsappVariations(phone);
  const result = await pool.query(
    "SELECT id, name, whatsapp FROM users WHERE whatsapp = ANY($1::text[]) LIMIT 1",
    [variations]
  );
  return result.rows[0] || null;
}

/**
 * Resumo financeiro do mês atual
 */
export async function getMonthSummary(whatsapp: string, monthOffset = 0): Promise<MonthSummary> {
  const variations = getWhatsappVariations(whatsapp);
  
  const now = new Date();
  const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const startOfMonth = targetMonth.toISOString().split("T")[0];
  const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as receitas,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as despesas,
      COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Essencial' THEN amount ELSE 0 END), 0) as essenciais,
      COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Importante' THEN amount ELSE 0 END), 0) as importantes,
      COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Supérfluo' THEN amount ELSE 0 END), 0) as superfluos,
      COUNT(*) as total_transactions
    FROM transactions 
    WHERE whatsapp = ANY($1::text[]) 
      AND date >= $2 AND date <= $3`,
    [variations, startOfMonth, endOfMonth]
  );

  const row = result.rows[0];
  const receitas = parseFloat(row.receitas) || 0;
  const despesas = parseFloat(row.despesas) || 0;

  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
    essenciais: parseFloat(row.essenciais) || 0,
    importantes: parseFloat(row.importantes) || 0,
    superfluos: parseFloat(row.superfluos) || 0,
    totalTransactions: parseInt(row.total_transactions) || 0,
  };
}

/**
 * Top N maiores despesas do mês atual
 */
export async function getTopExpenses(whatsapp: string, limit = 5): Promise<TopExpense[]> {
  const variations = getWhatsappVariations(whatsapp);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT estabelecimento, description, amount, category, date::text
     FROM transactions 
     WHERE whatsapp = ANY($1::text[]) 
       AND type = 'expense' 
       AND date >= $2 AND date <= $3
     ORDER BY amount DESC 
     LIMIT $4`,
    [variations, startOfMonth, endOfMonth, limit]
  );

  return result.rows.map((r) => ({
    estabelecimento: r.estabelecimento || r.description,
    description: r.description,
    amount: parseFloat(r.amount),
    category: r.category,
    date: r.date,
  }));
}

/**
 * Comparação mês atual vs mês anterior
 */
export async function getMonthComparison(whatsapp: string): Promise<MonthComparison> {
  const currentMonth = await getMonthSummary(whatsapp, 0);
  const previousMonth = await getMonthSummary(whatsapp, 1);

  const expenseChange = previousMonth.despesas > 0
    ? ((currentMonth.despesas - previousMonth.despesas) / previousMonth.despesas) * 100
    : 0;

  const incomeChange = previousMonth.receitas > 0
    ? ((currentMonth.receitas - previousMonth.receitas) / previousMonth.receitas) * 100
    : 0;

  return {
    currentMonth,
    previousMonth,
    expenseChange: Math.round(expenseChange),
    incomeChange: Math.round(incomeChange),
  };
}

/**
 * Breakdown por categoria com percentuais
 */
export async function getCategoryBreakdown(whatsapp: string): Promise<CategoryBreakdown[]> {
  const variations = getWhatsappVariations(whatsapp);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT 
      category, 
      SUM(amount) as total, 
      COUNT(*) as count
     FROM transactions 
     WHERE whatsapp = ANY($1::text[]) 
       AND type = 'expense' 
       AND date >= $2 AND date <= $3
     GROUP BY category
     ORDER BY total DESC`,
    [variations, startOfMonth, endOfMonth]
  );

  const totalExpenses = result.rows.reduce((acc, r) => acc + parseFloat(r.total), 0);

  return result.rows.map((r) => ({
    category: r.category,
    total: parseFloat(r.total),
    count: parseInt(r.count),
    percentage: totalExpenses > 0 ? Math.round((parseFloat(r.total) / totalExpenses) * 100) : 0,
  }));
}

/**
 * Transações recentes (últimas 5)
 */
export async function getRecentTransactions(whatsapp: string, limit = 5): Promise<TopExpense[]> {
  const variations = getWhatsappVariations(whatsapp);

  const result = await pool.query(
    `SELECT estabelecimento, description, amount, category, date::text
     FROM transactions 
     WHERE whatsapp = ANY($1::text[]) 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [variations, limit]
  );

  return result.rows.map((r) => ({
    estabelecimento: r.estabelecimento || r.description,
    description: r.description,
    amount: parseFloat(r.amount),
    category: r.category,
    date: r.date,
  }));
}

/**
 * Conta transações do tipo (ex: iFood) na semana atual
 */
export async function countWeeklyByEstablishment(whatsapp: string, searchTerm: string): Promise<number> {
  const variations = getWhatsappVariations(whatsapp);
  
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM transactions 
     WHERE whatsapp = ANY($1::text[]) 
       AND type = 'expense'
       AND (LOWER(estabelecimento) LIKE $2 OR LOWER(description) LIKE $2)
       AND date >= CURRENT_DATE - INTERVAL '7 days'`,
    [variations, `%${searchTerm.toLowerCase()}%`]
  );

  return parseInt(result.rows[0]?.count) || 0;
}

/**
 * Monta o snapshot financeiro completo para o prompt da Donna
 */
export async function buildFinancialSnapshot(whatsapp: string): Promise<FinancialSnapshot | null> {
  const user = await getUserByPhone(whatsapp);
  if (!user) return null;

  const [summary, topExpenses, comparison, categoryBreakdown, recentTransactions] = await Promise.all([
    getMonthSummary(user.whatsapp),
    getTopExpenses(user.whatsapp),
    getMonthComparison(user.whatsapp),
    getCategoryBreakdown(user.whatsapp),
    getRecentTransactions(user.whatsapp),
  ]);

  // Calcular dias restantes no mês
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = endOfMonth.getDate() - now.getDate();

  return {
    userName: user.name,
    summary,
    topExpenses,
    comparison,
    categoryBreakdown,
    daysRemaining,
    recentTransactions,
  };
}

/**
 * Formata o snapshot em texto para injetar no prompt da IA
 */
export function formatContextForPrompt(snapshot: FinancialSnapshot): string {
  const { summary, topExpenses, comparison, daysRemaining } = snapshot;
  
  const metaEssencial = summary.receitas * 0.5;
  const metaImportante = summary.receitas * 0.2;
  const metaSuperfluo = summary.receitas * 0.3;

  let context = `CONTEXTO FINANCEIRO ATUAL DO USUÁRIO:
- Saldo disponível: R$ ${summary.saldo.toFixed(2)}
- Receitas do mês: R$ ${summary.receitas.toFixed(2)}
- Despesas do mês: R$ ${summary.despesas.toFixed(2)}
  • Essenciais: R$ ${summary.essenciais.toFixed(2)} (meta 50%: R$ ${metaEssencial.toFixed(2)}) — ${metaEssencial > 0 ? Math.round((summary.essenciais / metaEssencial) * 100) : 0}% usado
  • Importantes: R$ ${summary.importantes.toFixed(2)} (meta 20%: R$ ${metaImportante.toFixed(2)}) — ${metaImportante > 0 ? Math.round((summary.importantes / metaImportante) * 100) : 0}% usado
  • Supérfluos: R$ ${summary.superfluos.toFixed(2)} (meta 30%: R$ ${metaSuperfluo.toFixed(2)}) — ${metaSuperfluo > 0 ? Math.round((summary.superfluos / metaSuperfluo) * 100) : 0}% usado
- Total de transações no mês: ${summary.totalTransactions}
- Dias restantes no mês: ${daysRemaining}`;

  if (topExpenses.length > 0) {
    context += `\n\nMAIORES GASTOS DO MÊS:`;
    topExpenses.forEach((e, i) => {
      context += `\n${i + 1}. ${e.estabelecimento} — R$ ${e.amount.toFixed(2)} (${e.category})`;
    });
  }

  if (comparison && comparison.previousMonth.totalTransactions > 0) {
    const arrow = (val: number) => val > 0 ? `↑${val}%` : val < 0 ? `↓${Math.abs(val)}%` : "—";
    context += `\n\nEVOLUÇÃO VS MÊS ANTERIOR:`;
    context += `\n- Despesas: ${arrow(comparison.expenseChange)}`;
    context += `\n- Receitas: ${arrow(comparison.incomeChange)}`;
    context += `\n- Despesas mês passado: R$ ${comparison.previousMonth.despesas.toFixed(2)}`;
  }

  return context;
}
