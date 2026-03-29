import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Users, MessageSquare, Bus, ShieldCheck, Mail, ChevronRight, 
  Terminal, Activity, Settings, LayoutDashboard 
} from 'lucide-react';
import { motion } from 'framer-motion';

const data = [
  { name: 'Mon', queries: 400 },
  { name: 'Tue', queries: 300 },
  { name: 'Wed', queries: 500 },
  { name: 'Thu', queries: 200 },
  { name: 'Fri', queries: 700 },
  { name: 'Sat', queries: 400 },
  { name: 'Sun', queries: 100 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const StatCard = ({ title, value, icon: Icon, color }) => (
  <motion.div 
    whileHover={{ scale: 1.02 }}
    className="glass-card p-6 flex items-center gap-5"
  >
    <div className={`p-4 rounded-xl shadow-lg`} style={{ backgroundColor: `${color}22` }}>
      <Icon className="w-8 h-8" style={{ color }} />
    </div>
    <div>
      <p className="text-gray-400 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold mt-1">{value}</h3>
    </div>
  </motion.div>
);

const App = () => {
  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-blue-500/20 shadow-xl">
            <Terminal className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">MSAJCE <span className="text-blue-500">Telebot</span></h1>
            <p className="text-gray-500 font-medium">Institutional Intelligence System</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="glass-card px-5 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-white/5 transition-all">
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button className="glass-card px-5 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-white/5 transition-all">
            <Settings className="w-4 h-4" /> Config
          </button>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Enrolment" value="1,246" icon={Users} color="#3b82f6" />
        <StatCard title="Daily Queries" value="842" icon={MessageSquare} color="#10b981" />
        <StatCard title="Transport Sync" value="98%" icon={Bus} color="#f59e0b" />
        <StatCard title="Verifications" value="12" icon={ShieldCheck} color="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
        {/* CHART SECTION */}
        <div className="lg:col-span-2 glass-card p-8 min-h-[400px]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" /> Usage Frequency
            </h3>
            <select className="bg-transparent text-sm border-none focus:ring-0">
                <option>Last 7 Days</option>
            </select>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff11" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff22', borderRadius: '12px' }}
                />
                <Area type="monotone" dataKey="queries" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LOGS / NOTIFICATIONS */}
        <div className="glass-card p-8 space-y-6 overflow-hidden">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" /> Security Feed
          </h3>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/20" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium">IDENTITY ENROLLED</p>
                  <p className="text-sm font-bold">Ramanathan S (IT Dept)</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
