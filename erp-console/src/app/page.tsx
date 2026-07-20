'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { erp } from '@/src/lib/api';

export default function ConnectPage() {
  const router = useRouter();
  const [apiKey, setApiKey]     = useState('');
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const info = await erp.loadWorkspace(apiKey.trim());
      // Store key and workspace name for the console session.
      sessionStorage.setItem('erp_api_key', apiKey.trim());
      sessionStorage.setItem('erp_workspace_name', info.workspace_name);
      sessionStorage.setItem('erp_workspace_id', info.workspace_id);
      router.push('/console');
    } catch (err: any) {
      setError(err.message ?? 'Connection failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ANPTCO Dispatch Console</h1>
          <p className="text-slate-400 text-sm mt-1">ERP Integration — Machine-to-Machine</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Connect your workspace</h2>
          <p className="text-sm text-gray-500 mb-6">
            Enter the dispatch API key generated in the ANPTCO Platform Admin console.
            The key identifies your workspace and authorizes dispatch requests.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Dispatch API Key
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="dk_••••••••••••••••••••••••••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {show ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-semibold rounded-xl transition text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Validating key…
                </span>
              ) : 'Connect to ANPTCO'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Keys are generated in Platform Admin → Onboarding → API Keys tab.
              Each key is workspace-scoped and shown only once on creation.
            </p>
          </div>
        </div>

        {/* Flow hint */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { step: '1', label: 'Enter API Key' },
            { step: '2', label: 'Select truck & route' },
            { step: '3', label: 'Dispatch trip' },
          ].map(({ step, label }) => (
            <div key={step} className="bg-slate-800 rounded-xl p-3">
              <div className="text-blue-400 font-bold text-lg">{step}</div>
              <div className="text-slate-400 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
