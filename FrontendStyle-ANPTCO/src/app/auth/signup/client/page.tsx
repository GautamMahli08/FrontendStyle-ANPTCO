'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp, confirmSignUp, signIn } from '@/src/lib/auth';
import { api } from '@/src/lib/api';

type Step = 'personal' | 'station' | 'confirm' | 'done';

interface FormData {
  firstName:     string;
  lastName:      string;
  email:         string;
  password:      string;
  stationName:   string;
  stationLat:    string;
  stationLng:    string;
  stationRadius: string;
  phone:         string;
  code:          string;
}

const EMPTY: FormData = {
  firstName:     '',
  lastName:      '',
  email:         '',
  password:      '',
  stationName:   '',
  stationLat:    '',
  stationLng:    '',
  stationRadius: '100',
  phone:         '',
  code:          '',
};

export default function ClientSignup() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>('personal');
  const [form,    setForm]    = useState<FormData>(EMPTY);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Step 1: personal info → Cognito signUp ───────────────────
  const handlePersonal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('Please fill in all fields'); return;
    }
    setLoading(true);
    try {
      const { nextStep } = await signUp({
        email:     form.email,
        password:  form.password,
        firstName: form.firstName,
        lastName:  form.lastName,
      });
      if (nextStep === 'CONFIRM_SIGN_UP') setStep('confirm');
      else                                setStep('station');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step confirm: 6-digit code ────────────────────────────────
  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(form.email, form.code);
      setStep('station');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: station geofence + finish ─────────────────────────
  const handleStation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const lat    = parseFloat(form.stationLat);
    const lng    = parseFloat(form.stationLng);
    const radius = parseInt(form.stationRadius, 10);
    if (!form.stationName || isNaN(lat) || isNaN(lng)) {
      setError('Station name, latitude and longitude are required'); return;
    }
    if (radius < 50) {
      setError('Minimum geofence radius is 50 m'); return;
    }
    setLoading(true);
    try {
      // Sign in to get a session (PostConfirmation already set workspace + CLIENT group)
      await signIn(form.email, form.password);
      // Register the station geofence
      await api.stations.create({
        name:          form.stationName,
        latitude:      lat,
        longitude:     lng,
        radius_meters: radius,
      });
      setStep('done');
      setTimeout(() => router.push('/client/dashboard'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create station');
    } finally {
      setLoading(false);
    }
  };

  // ── Done screen ───────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full text-center">
          <div className="animate-bounce mb-6"><span className="text-8xl">✅</span></div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            Welcome, {form.firstName}!<br />Your station is registered — you can now place fuel orders.
          </p>
          <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  const stepNum  = step === 'personal' ? 1 : step === 'confirm' ? 1 : 2;
  const totalSteps = 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <button
          onClick={() => step === 'personal' ? router.push('/') : setStep('personal')}
          className="text-orange-600 hover:text-orange-700 mb-6 text-sm"
        >
          ← Back
        </button>

        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏪</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Client Account</h1>
          <p className="text-gray-600">Order fuel for your station</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2].map(n => (
            <div key={n} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold
                ${stepNum >= n ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {n}
              </div>
              <span className={`ml-2 font-medium text-sm ${stepNum >= n ? 'text-orange-600' : 'text-gray-400'}`}>
                {n === 1 ? 'Account' : 'Station'}
              </span>
              {n < totalSteps && <div className={`w-16 h-1 mx-3 ${stepNum > n ? 'bg-orange-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* ── Personal info ──────────────────────────────────── */}
        {step === 'personal' && (
          <form onSubmit={handlePersonal} className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name *</label>
                <input type="text" value={form.firstName} onChange={set('firstName')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Fatima" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name *</label>
                <input type="text" value={form.lastName} onChange={set('lastName')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Al-Hashmi" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="fatima@station.om" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
              <input type="password" value={form.password} onChange={set('password')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Min 8 characters" minLength={8} required />
            </div>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              {loading ? 'Creating account…' : 'Continue'}
            </button>
          </form>
        )}

        {/* ── Confirm code ────────────────────────────────────── */}
        {step === 'confirm' && (
          <form onSubmit={handleConfirm} className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              We sent a 6-digit code to <strong>{form.email}</strong>. Enter it below to verify your account.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification code *</label>
              <input type="text" value={form.code} onChange={set('code')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent tracking-widest text-center text-xl"
                placeholder="000000" maxLength={6} required />
            </div>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
        )}

        {/* ── Station details ──────────────────────────────────── */}
        {step === 'station' && (
          <form onSubmit={handleStation} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Station Name *</label>
              <input type="text" value={form.stationName} onChange={set('stationName')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="My Petrol Station" required />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Latitude *</label>
                <input type="number" step="any" value={form.stationLat} onChange={set('stationLat')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="23.6139" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Longitude *</label>
                <input type="number" step="any" value={form.stationLng} onChange={set('stationLng')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="58.5922" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Geofence Radius (metres) * <span className="font-normal text-gray-500">min 50 m</span>
              </label>
              <input type="number" value={form.stationRadius} onChange={set('stationRadius')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                min={50} max={5000} required />
              <p className="text-xs text-gray-500 mt-1">
                Delivery is unlocked when the truck enters this radius around your station.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="+968 9345 6789" />
            </div>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              {loading ? 'Registering station…' : 'Create account & register station'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/auth/login')} className="text-orange-600 hover:text-orange-700 font-medium">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
