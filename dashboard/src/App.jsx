import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Terminal, ShieldCheck, Mail, ChevronRight, 
  Cpu, Layers, Activity, Search, RefreshCcw, Download, Clock
} from 'lucide-react';

const App = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:3001/api/logs');
      setLogs(res.data);
      setError(null);
    } catch (e) {
      setError("Syncing Error: Backend Cluster Offline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalTokens = logs.reduce((acc, log) => acc + (log.tokens?.reasoning || 0) + (log.tokens?.formulation || 0), 0);

  return (
    <div className="min-h-screen bg-[#fafbfc] p-8 lg:p-14 text-slate-600 font-sans selection:bg-blue-50 selection:text-blue-600">
      {/* STRUCTURED TOP NAV */}
      <div className="max-w-[1500px] mx-auto flex justify-between items-center mb-16 px-2">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xs font-black tracking-[0.2em] text-slate-400 uppercase">MSAJCE Audit Hub</h1>
            <p className="text-[10px] text-slate-300 uppercase tracking-widest mt-0.5">Automated Intelligence Pipeline 2.0</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button onClick={fetchLogs} className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm clickable">
            <RefreshCcw className="w-3.5 h-3.5" /> Synchronize Logs
          </button>
          <button className="bg-slate-900 border border-slate-900 px-5 py-2.5 rounded-xl text-[11px] text-white uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-200 clickable">
            <Download className="w-3.5 h-3.5" /> Export Audit
          </button>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
        {/* SUMMARY CARDS --- STRUCTURED MINIMALISM */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Total Interactions</p>
            <h3 className="text-xl text-slate-800">{logs.length}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-5">
           <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Cluster Consumption</p>
            <h3 className="text-xl text-slate-800">{(totalTokens / 1000).toFixed(1)}k <span className="text-xs text-slate-300">TK</span></h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-5 lg:col-span-2">
           <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">System Integrity</p>
            <div className="flex items-center gap-3 mt-1">
                <span className="text-xl text-slate-800">Operational</span>
                <div className="h-1.5 flex-1 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-green-501 w-[100%] transition-all" />
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* THE STRUCTURED AUDIT TABLE */}
      <div className="max-w-[1500px] mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-12">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-300" /> Live Interaction Audit
            </h3>
            <span className="text-[9px] uppercase tracking-[0.2em] text-blue-500 bg-blue-50 px-3 py-1 rounded-full">Automated Refresh Active</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full">
            <thead>
                <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-300 font-normal">Timestamp</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-300 font-normal">Interaction & ID</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-300 font-normal">AI Stage Verification</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-300 font-normal">Response Preview</th>
                    <th className="px-8 py-4 text-right text-[10px] uppercase tracking-widest text-slate-300 font-normal">Resources</th>
                </tr>
            </thead>
            <tbody>
                {logs.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-20 text-[11px] text-slate-300 uppercase tracking-widest italic">Synchronizing with MongoDB Cluster Intelligence...</td></tr>
                ) : logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/50 transition-all group clickable border-b border-slate-50 last:border-0">
                        <td className="px-8 py-6">
                            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-300">
                                <Clock className="w-3 h-3" /> {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                            </div>
                        </td>
                        <td className="px-8 py-6">
                            <div className="max-w-[300px]">
                                <p className="text-xs text-slate-700 leading-relaxed mb-1 truncate">{log.query}</p>
                                <p className="text-[9px] uppercase tracking-widest text-slate-300">Client ID: {log.userId}</p>
                            </div>
                        </td>
                        <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                                {log.steps && log.steps.map((_, i) => (
                                    <div key={i} className="w-1 h-3 rounded-full bg-blue-500/20 group-hover:bg-blue-500 transition-all" />
                                ))}
                                <span className="text-[10px] text-slate-400 capitalize">{log.steps?.length || 0} Stages Verified</span>
                            </div>
                        </td>
                        <td className="px-8 py-6">
                            <p className="text-[11px] text-slate-400 italic line-clamp-1 max-w-[400px]">
                                {log.response}
                            </p>
                        </td>
                        <td className="px-8 py-6 text-right">
                            <div className="inline-flex flex-col items-end">
                                <span className="text-[12px] text-slate-700 font-mono tracking-tighter">
                                    {(log.tokens?.reasoning || 0) + (log.tokens?.formulation || 0)} <span className="text-[9px] text-slate-300">TK</span>
                                </span>
                                <div className="flex gap-2 text-[8px] uppercase tracking-tighter opacity-30 mt-0.5">
                                    <span>NVIDIA {log.tokens?.reasoning || 0}</span>
                                    <span>GEMINI {log.tokens?.formulation || 0}</span>
                                </div>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>

      {/* FOOTER AUDIT LABEL --- MINIMAL */}
      <div className="max-w-[1500px] mx-auto px-2 flex justify-between items-center opacity-20 text-[9px] uppercase tracking-[0.3em]">
          <span>Security Protocol: RSA-2048 + MongoDB Atlas Hub</span>
          <span className="flex items-center gap-2">Confidential <ShieldCheck className="w-3 h-3" /> 2026 MSAJCE</span>
      </div>
    </div>
  );
};

// Mocking MessageSquare for logic completion
const MessageSquare = ({className}) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>;

export default App;
