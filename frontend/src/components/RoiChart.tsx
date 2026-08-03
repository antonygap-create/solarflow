import React from 'react';
import { useSolar } from '../context/SolarContext';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { TrendingUp, DollarSign, Calendar } from 'lucide-react';

export const RoiChart: React.FC = () => {
  const { 
    cashFlowProjections, 
    paybackYears, 
    net25YearSavings, 
    activePanelsCount 
  } = useSolar();

  if (activePanelsCount === 0 || cashFlowProjections.length === 0) {
    return (
      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 text-center text-slate-400 text-sm">
        No active panels. Activate panels on the map to view ROI financial projections.
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (Math.abs(val) >= 1000) {
      return `$${(val / 1000).toFixed(1)}k`;
    }
    return `$${val}`;
  };

  return (
    <div className="space-y-4">
      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Payback Period</div>
            <div className="text-base font-bold text-emerald-400">
              {paybackYears ? `${paybackYears} Years` : '> 25 Years'}
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center space-x-3">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">25-Yr Net Value</div>
            <div className="text-base font-bold text-amber-400">
              ${(net25YearSavings / 1000).toFixed(1)}k
            </div>
          </div>
        </div>
      </div>

      {/* 25-Year Recharts Cumulative Cash Flow Chart */}
      <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              25-Year Cumulative Cash Flow ($)
            </h4>
          </div>
          {paybackYears && (
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-semibold border border-emerald-500/30">
              Break-Even: Year {paybackYears}
            </span>
          )}
        </div>

        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={cashFlowProjections}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorCashFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="year"
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                tickFormatter={(yr) => `Y${yr}`}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                tickFormatter={formatCurrency}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  color: '#f8fafc',
                  fontSize: '12px'
                }}
                formatter={(value: any, name: any) => [
                  `$${Number(value).toLocaleString()}`,
                  name === 'cumulativeCashFlow' ? 'Cumulative Cash Flow' : 'Annual Savings'
                ]}
                labelFormatter={(yr) => `Year ${yr}`}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              {paybackYears && (
                <ReferenceLine
                  x={Math.round(paybackYears)}
                  stroke="#10b981"
                  strokeWidth={2}
                  label={{
                    value: `Break-Even Y${paybackYears}`,
                    fill: '#10b981',
                    fontSize: 10,
                    position: 'top'
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="cumulativeCashFlow"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCashFlow)"
              />
              <Line
                type="monotone"
                dataKey="annualSavings"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
