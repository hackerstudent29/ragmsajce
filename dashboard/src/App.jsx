import React, { useState, useEffect } from 'react';
import axios from 'axios';

const App = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/logs');
      setLogs(res.data);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 8000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const totalNvidia = logs.reduce((s, l) => s + (l.tokens?.reasoning || 0), 0);
  const totalGemini = logs.reduce((s, l) => s + (l.tokens?.formulation || 0), 0);

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10 text-[#111]">

      {/* DATE HEADER */}
      <div className="border-b border-gray-200 pb-6 mb-8">
        <h1 className="text-[15px] text-black">{today}</h1>
        <p className="text-[11px] text-gray-400 mt-1">MSAJCE Assistant — Execution Log</p>
      </div>

      {/* SUMMARY BAR */}
      <div className="flex gap-8 mb-8 text-[12px] text-gray-500 border-b border-gray-100 pb-4">
        <span>Queries: <span className="text-black">{logs.length}</span></span>
        <span>NVIDIA Tokens: <span className="text-black">{totalNvidia.toLocaleString()}</span></span>
        <span>Gemini Tokens: <span className="text-black">{totalGemini.toLocaleString()}</span></span>
        <span>Total: <span className="text-black">{(totalNvidia + totalGemini).toLocaleString()}</span></span>
        <button onClick={fetchLogs} className="ml-auto text-blue-600 hover:underline">Refresh</button>
      </div>

      {/* LOG ENTRIES */}
      {loading && logs.length === 0 && (
        <p className="text-center text-gray-300 text-[12px] py-20">Loading logs...</p>
      )}

      {logs.map((log) => {
        const ts = new Date(log.timestamp);
        const time = ts.toLocaleTimeString('en-GB', { hour12: false });
        const nv = log.tokens?.reasoning || 0;
        const gm = log.tokens?.formulation || 0;

        return (
          <div key={log._id} className="log-entry">
            {/* QUERY LINE */}
            <div className="flex items-start gap-4 mb-3">
              <span className="text-[11px] text-gray-400 font-mono min-w-[70px]">{time}</span>
              <span className="text-[13px] text-black flex-1">Q: {log.query}</span>
              <span className="text-[11px] text-gray-400">user:{log.userId}</span>
            </div>

            {/* STEPS */}
            <div className="ml-[84px] mb-3">
              {log.steps && log.steps.map((step, i) => (
                <div key={i} className="step-line">
                  <span className="step-time">{time.slice(0, 5)}:{String((ts.getSeconds() + i * 2) % 60).padStart(2, '0')}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  <span className="step-label">{step}</span>
                  {i === 1 && <span className="step-tokens">nvidia: {nv} tk</span>}
                  {i === 2 && <span className="step-tokens">gemini: {gm} tk</span>}
                </div>
              ))}
            </div>

            {/* RESPONSE */}
            <div className="ml-[84px] text-[12px] text-gray-600 leading-relaxed border-l-2 border-gray-100 pl-4">
              A: {log.response}
            </div>

            {/* TOKEN FOOTER */}
            <div className="ml-[84px] mt-2 flex gap-6 text-[10px] text-gray-400">
              <span>nvidia/llama-405b: {nv} tokens</span>
              <span>google/gemini-3-flash: {gm} tokens</span>
              <span>total: {nv + gm} tokens</span>
            </div>
          </div>
        );
      })}

      {!loading && logs.length === 0 && (
        <p className="text-center text-gray-300 text-[12px] py-20">No logs recorded yet. Send a message to the bot.</p>
      )}
    </div>
  );
};

export default App;
