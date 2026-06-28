'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, confirmNewPassword } from '@/src/lib/auth';
import OomcoLogo from '@/src/components/assets/OomcoLogo';

const ROLE_ROUTES: Record<string, string> = {
  PLATFORM_ADMIN:  '/platform-admin/dashboard',
  SELLER_MANAGER:  '/seller/dashboard',
  TRANSPORT_ADMIN: '/transport/dashboard',
  DRIVER:          '/driver/dashboard',
  CLIENT:          '/client/dashboard',
};

export default function LoginPage() {
  const router = useRouter();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [step,        setStep]        = useState<'credentials' | 'new-password'>('credentials');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const handleSignIn = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.challenge === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setStep('new-password');
        return;
      }
      const user = result.user!;
      router.push(ROLE_ROUTES[user.role] ?? '/client/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) { setError('Passwords do not match'); return; }
    if (newPass.length < 8)      { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      const user = await confirmNewPassword(newPass);
      router.push(ROLE_ROUTES[user.role] ?? '/client/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <OomcoLogo className="w-16 h-10 mx-auto mb-4" />
          {step === 'credentials' ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Sign in to your account</h1>
              <p className="text-slate-500 text-sm mt-1">Fuel Ordering &amp; Monitoring Platform</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
              <p className="text-slate-500 text-sm mt-1">Your account requires a new password before continuing.</p>
            </>
          )}
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.com" required autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••" required autoComplete="current-password"
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleNewPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
              <input
                type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Min. 8 characters" required autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
              <input
                type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••" required autoComplete="new-password"
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              {loading ? 'Setting password…' : 'Set password & continue'}
            </button>
          </form>
        )}

        {step === 'credentials' && (
          <p className="text-center text-sm text-slate-500 mt-6">
            New client?{' '}
            <button onClick={() => router.push('/auth/signup/client')}
              className="text-blue-600 hover:text-blue-700 font-medium">
              Create account
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
