import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { type Transaction } from "../types";

export default function DashboardCharts({ transactions }: { transactions: Transaction[] }) {
  const [activeTab, setActiveTab] = useState<"expenses" | "income">("expenses");

  const { expenseData, incomeData } = useMemo(() => {
    const expensesMap = new Map<string, number>();
    const incomeMap = new Map<string, number>();

    transactions.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === "expense") {
        expensesMap.set(tx.category, (expensesMap.get(tx.category) || 0) + amount);
      } else {
        incomeMap.set(tx.category, (incomeMap.get(tx.category) || 0) + amount);
      }
    });

    return {
      expenseData: Array.from(expensesMap.entries()).map(([name, value]) => ({ name, value })),
      incomeData: Array.from(incomeMap.entries()).map(([name, value]) => ({ name, value }))
    };
  }, [transactions]);

  const COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#6B7280'];

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

    return percent > 0.05 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="11px" fontWeight="600">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  const chartData = activeTab === "expenses" ? expenseData : incomeData;

  return (
    <div className="">
      {chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
          Nenhum dado disponível
        </div>
      ) : (
        <div className="h-[180px] relative w-full mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={90}
                innerRadius={30}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 grid grid-cols-2 gap-y-3 gap-x-4">
        {chartData.map((entry, index) => (
          <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2 overflow-hidden">
              <div 
                className="w-2 h-2 rounded-full flex-shrink-0" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }} 
              />
              <span className="text-[11px] font-bold text-gray-500 truncate uppercase tracking-tight">{entry.name}</span>
            </div>
            <span className="text-[12px] font-bold text-gray-900 ml-2">
              {entry.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
