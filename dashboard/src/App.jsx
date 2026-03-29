import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area
} from 'recharts';
import { 
  Users, MessageSquare, Bus, ShieldCheck, Mail, ChevronRight, 
  Terminal, Activity, Settings, LayoutDashboard, Cpu, Layers, Disc3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const data = [
  { name: 'Mon', queries: 400, tokens: 12000 },
  { name: 'Tue', queries: 300, tokens: 9000 },
  { name: 'Wed', queries: 500, tokens: 15600 },
  { name: 'Thu', queries: 200, tokens: 8000 },
  { name: 'Fri', queries: 700, tokens: 22000 },
  { name: 'Sat', queries: 400, tokens: 13000 },
  { name: 'Sun', queries: 100, tokens: 4000 },
];

const mockLogs = [
  {
    id: 1, query: "Who is the principal?", 
    tokens: { reasoning: 142, formulation: 89 },
    steps: ["Retrieval Successful", "Analyzing Intent", "NVIDIA Llama 3.1 Reasoning", "Gemini 3 Flash Output", "Delivered"],
    timestamp: "12:04:12"
  },
  {
    id: 2, query: "Show bus route for AR-3", 
    tokens: { reasoning: 98, formulation: 210 },
    steps: ["Transport Match Found", "Logic Validated", "Mapping Stops", "Output Generated"],
    timestamp: "12:05:45"
  }
];

const StatCard = ({ title, value, icon: Icon, color }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="glass-card p-6 flex items-center gap-5 border-none shadow-sm bg-white"
  >
    <div className={`p-4 rounded-2xl shadow-sm`} style={{ backgroundColor: `${color}15` }}>
      <Icon className="w-8 h-8" style={{ color }} />
    </div>
    <div className="flex-1">
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</p>
      <h3 className="text-2xl font-black text-slate-800 tracking-tight">{value}</h3>
    </div>
  </motion.div>
);

const App = () => {
  const [selectedLog, setSelectedLog] = useState(mockLogs[0]);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12 max-w-[1600px] mx-auto text-slate-900 font-sans">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-blue-600 rounded-3xl shadow-xl shadow-blue-500/30">
            <Cpu className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">MSAJCE <span className="text-blue-600">Assistant</span></h1>
            <p className="text-slate-400 font-bold text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" /> SYSTEM OPERATIONAL LIVE
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="glass-card px-6 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" /> REFRESH
          </button>
          <button className="bg-slate-900 px-6 py-2.5 text-sm font-black text-white hover:bg-black transition-all rounded-2xl flex items-center gap-2 shadow-xl shadow-slate-900/20">
            <Settings className="w-4 h-4" /> EXPORT PDF
          </button>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Enrolment" value="1,246" icon={Users} color="#2563eb" />
        <StatCard title="Daily Total Queries" value="842" icon={MessageSquare} color="#059669" />
        <StatCard title="Token Consumption" value="234.2K" icon={Cpu} color="#8b5cf6" />
        <StatCard title="RAG Confidence" value="99.4%" icon={Layers} color="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-10">
        {/* LOGS LIST */}
        <div className="lg:col-span-4 h-[700px] flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-black text-slate-500 text-xs uppercase tracking-widest flex items-center gap-2">
              <Disc3 className="w-4 h-4 text-slate-300" /> Interaction Reports
            </h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">LIVE</span>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {mockLogs.map((log) => (
              <motion.div 
                key={log.id}
                onClick={() => setSelectedLog(log)}
                whileTap={{ scale: 0.98 }}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${selectedLog.id === log.id ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/5' : 'bg-slate-50 border-transparent grayscale hover:grayscale-0 hover:bg-white'}`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black bg-white/50 px-2 py-0.5 rounded text-slate-500 uppercase">{log.timestamp}</span>
                  <div className="flex items-center gap-1 text-[10px] font-black text-indigo-500">
                    <Cpu className="w-3 h-3" /> {log.tokens.reasoning + log.tokens.formulation} TK
                  </div>
                </div>
                <h4 className="mt-3 font-bold text-slate-800 line-clamp-1">{log.query}</h4>
                <div className="mt-4 flex gap-1">
                  {log.steps.slice(0, 3).map((st, idx) => (
                    <div key={idx} className="h-1.5 w-8 rounded-full bg-blue-500 opacity-20" />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* LOG DETAIL REPORT */}
        <div className="lg:col-span-8 space-y-6 lg:h-[700px] overflow-y-auto pr-2">
          {selectedLog && (
            <AnimatePresence mode="wait">
              <motion.div 
                key={selectedLog.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass-card p-10 min-h-full bg-white space-y-12"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-blue-600 font-black text-xs uppercase tracking-widest">Report Detail</span>
                    <h2 className="text-3xl font-black text-slate-900 mt-2">{selectedLog.query}</h2>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-slate-400 font-bold text-xs">Total Consumption</span>
                    <span className="text-4xl font-black text-slate-800">{selectedLog.tokens.reasoning + selectedLog.tokens.formulation}</span>
                  </div>
                </div>

                {/* STEPS AUDIT */}
                <div className="space-y-6">
                   <h3 className="font-black text-slate-500 text-xs uppercase tracking-widest flex items-center gap-2">
                     <Layers className="w-4 h-4" /> Execution Steps Audit
                   </h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedLog.steps.map((step, idx) => (
                        <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center">
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold text-slate-700">{step}</span>
                        </div>
                      ))}
                   </div>
                </div>

                {/* TOKEN USAGE DEEP DIVE */}
                <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-100">
                   <div className="p-6 rounded-3xl bg-indigo-50/50 space-y-1 border border-indigo-100">
                      <p className="text-indigo-400 font-black text-[10px] uppercase tracking-widest">Stage 1: NVIDIA Llama 405B</p>
                      <h4 className="text-3xl font-black text-indigo-600">{selectedLog.tokens.reasoning} <span className="text-sm">tokens</span></h4>
                      <p className="text-indigo-400 text-xs font-bold leading-relaxed mt-4">NVIDIA reasoning engine analyze the database context, retrieval chunks, and intent classification.</p>
                   </div>
                   <div className="p-6 rounded-3xl bg-blue-50/50 space-y-1 border border-blue-100">
                      <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">Stage 2: Google Gemini 3 Flash</p>
                      <h4 className="text-3xl font-black text-blue-600">{selectedLog.tokens.formulation} <span className="text-sm">tokens</span></h4>
                      <p className="text-blue-400 text-xs font-bold leading-relaxed mt-4">Gemini formulation stage transforms the reasoning plan into a deterministic, human-readable answer.</p>
                   </div>
                </div>

                {/* FREQUENCY CHART */}
                <div className="pt-6">
                   <h3 className="font-black text-slate-500 text-xs uppercase tracking-widest mb-6">Network Intensity</h3>
                   <div className="w-full h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data}>
                        <defs>
                          <linearGradient id="colorTok" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" hide />
                        <Tooltip />
                        <Area type="monotone" dataKey="tokens" stroke="#2563eb" strokeWidth={3} fill="url(#colorTok)" />
                      </AreaChart>
                    </ResponsiveContainer>
                   </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
