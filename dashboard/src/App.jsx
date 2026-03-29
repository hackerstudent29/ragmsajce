import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Terminal, ShieldCheck, Mail, ChevronRight, 
  Cpu, Layers, Activity, Search, RefreshCcw, Download 
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
      setError("Unable to connect to Real-time Hub. Please check backend.");
      // Fallback mock if needed for demo
      if (logs.length === 0) setLogs([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white max-w-[1400px] mx-auto p-12 text-slate-600 antialiased">
      {/* HEADER SECTION --- MINIMAL */}
      <div className="flex justify-between items-center mb-16 px-4">
        <div className="flex items-center gap-4">
          <Terminal className="w-5 h-5 text-slate-300" />
          <h1 className="text-sm uppercase tracking-widest text-slate-400">MSAJCE Auditor v2.1</h1>
        </div>
        <div className="flex gap-10 text-[11px] uppercase tracking-widest text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm" /> Live Connection
          </div>
          <button onClick={fetchLogs} className="flex items-center gap-2 hover:text-slate-800 transition-all">
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh Hub
          </button>
          <button className="flex items-center gap-2 hover:text-slate-800 transition-all">
            <Download className="w-3.5 h-3.5" /> Logs Export
          </button>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && <div className="mx-4 mb-8 text-[11px] text-red-500 uppercase tracking-widest border border-red-50 px-4 py-2 rounded">{error}</div>}

      {/* AUDIT LOG TABLE --- REAL DATA */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Question & Intent</th>
              <th>Reasoning / AI Step Audit</th>
              <th>Response Formulation</th>
              <th className="text-right">Token Consumption</th>
            </tr>
          </thead>
          <tbody>
            {(loading && logs.length === 0) ? (
              <tr><td colSpan="5" className="text-center py-20 text-[11px] uppercase tracking-widest text-slate-300">Synchronizing Local Records...</td></tr>
            ) : logs.map((log) => (
              <tr key={log._id} className="log-row clickable">
                <td className="w-32 opacity-40 font-mono text-[11px]">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                </td>
                <td className="w-1/4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-slate-800 leading-relaxed">{log.query}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Search className="w-3 h-3" /> UserID: {log.userId}
                    </span>
                  </div>
                </td>
                <td className="w-1/4 text-[12px] opacity-70">
                   <div className="flex flex-col gap-2">
                      {log.steps && log.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="step-dot" /> {step}
                        </div>
                      ))}
                   </div>
                </td>
                <td className="w-1/3 text-slate-400 leading-relaxed text-[12px] italic">
                   {log.response.substring(0, 150)}...
                </td>
                <td className="text-right">
                   <div className="flex flex-col items-end gap-1.5">
                    <span className="token-pill">{log.tokens.reasoning + log.tokens.formulation} Total</span>
                    <div className="flex gap-2 text-[9px] uppercase tracking-wider opacity-30">
                      <span>NVIDIA: {log.tokens.reasoning}</span>
                      <span>GEMINI: {log.tokens.formulation}</span>
                    </div>
                   </div>
                </td>
              </tr>
            ))}
            {!loading && logs.length === 0 && (
              <tr><td colSpan="5" className="text-center py-20 text-[11px] uppercase tracking-widest text-slate-300 italic">No interaction records found in MongoDB Cluster</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER AUDIT INFO */}
      <div className="mt-20 px-4 flex justify-between items-center text-[10px] uppercase tracking-[0.2em] text-slate-200">
         <span>RAG Pipeline Architecture: Llama-3.1-405B + Gemini-3-Flash</span>
         <span className="flex items-center gap-4">
           MSAJCE Internal Use Only <ShieldCheck className="w-3 h-3" />
         </span>
      </div>
    </div>
  );
};

export default App;
