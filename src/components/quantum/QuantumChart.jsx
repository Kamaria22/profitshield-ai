import React from 'react';
import { Line, Bar } from 'recharts';
import { LineChart, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

/**
 * QUANTUM CHART COMPONENTS
 * Futuristic data visualization with holographic effects
 */

const QuantumTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;

  return (
    <div className="backdrop-blur-xl bg-slate-900/90 border border-cyan-500/30 rounded-lg p-3 shadow-xl">
      <p className="text-cyan-400 font-semibold mb-2">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export function QuantumLineChart({ data, lines, height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <defs>
          {lines.map((line, i) => (
            <linearGradient key={i} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 255, 255, 0.1)" />
        <XAxis 
          dataKey="name" 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <YAxis 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <Tooltip content={<QuantumTooltip />} />
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            <Area
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              fill={`url(#gradient-${i})`}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={3}
              dot={{ fill: line.color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </React.Fragment>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function QuantumBarChart({ data, bars, height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 255, 255, 0.1)" />
        <XAxis 
          dataKey="name" 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <YAxis 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <Tooltip content={<QuantumTooltip />} />
        {bars.map((bar, i) => (
          <Bar
            key={i}
            dataKey={bar.dataKey}
            fill={bar.color}
            radius={[8, 8, 0, 0]}
            opacity={0.8}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuantumAreaChart({ data, areas, height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          {areas.map((area, i) => (
            <linearGradient key={i} id={`area-gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={area.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={area.color} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 255, 255, 0.1)" />
        <XAxis 
          dataKey="name" 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <YAxis 
          stroke="#00ffff" 
          tick={{ fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(0, 255, 255, 0.3)' }}
        />
        <Tooltip content={<QuantumTooltip />} />
        {areas.map((area, i) => (
          <Area
            key={i}
            type="monotone"
            dataKey={area.dataKey}
            stroke={area.color}
            fill={`url(#area-gradient-${i})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}