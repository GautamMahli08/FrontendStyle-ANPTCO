'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCurrentUser,
  setCurrentUser,
  findUserByEmail,
  PLATFORM_ADMIN,
  getDrivers,
} from '@/src/lib/demo-data';

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<'landing' | 'login' | 'choose-role'>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (email === 'admin@fuelplatform.com' && password === 'admin123') {
      setCurrentUser(PLATFORM_ADMIN);
      router.push('/platform-admin/dashboard');
      return;
    }

    const drivers = getDrivers();
    const driver = drivers.find(d => d.email === email && d.password === password);

    if (driver) {
      if (!driver.verified) {
        setError('Your driver account is pending verification. Please contact your transport admin.');
        return;
      }
      const driverUser = {
        id: driver.id,
        email: driver.email,
        firstName: driver.firstName,
        lastName: driver.lastName,
        name: `${driver.firstName} ${driver.lastName}`,
        role: 'DRIVER' as const,
        workspaceId: driver.workspaceId,
        verified: driver.verified,
      };
      setCurrentUser(driverUser);
      router.push('/driver/dashboard');
      return;
    }

    const user = findUserByEmail(email);
    if (!user) {
      setError('Account not found. Please create an account first.');
      return;
    }

    if (!user.verified) {
      setError('Your account is pending verification. Please wait for admin approval.');
      return;
    }

    setCurrentUser(user);

    const routes: Record<string, string> = {
      PLATFORM_ADMIN: '/platform-admin/dashboard',
      SELLER_MANAGER: '/seller/dashboard',
      TRANSPORT_ADMIN: '/transport/dashboard',
      CLIENT: '/client/dashboard',
      DRIVER: '/driver/dashboard',
    };

    router.push(routes[user.role]);
  };

  /* ===================== LOGIN VIEW ===================== */
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-md p-8 max-w-md w-full">
          <button
            onClick={() => setView('landing')}
            className="text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            ← Back
          </button>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">FuelFleet</h1>
            <p className="text-sm text-gray-500">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="name@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account?{' '}
            <button
              onClick={() => setView('choose-role')}
              className="text-blue-600 hover:underline font-medium"
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    );
  }

  /* ===================== CHOOSE ROLE ===================== */
  if (view === 'choose-role') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-md p-8 max-w-4xl w-full">
          <button
            onClick={() => setView('landing')}
            className="text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            ← Back
          </button>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Create Account</h1>
            <p className="text-sm text-gray-500">Choose your role to get started</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <RoleCard
              icon="🏢"
              title="Seller Manager"
              description="Manage depot, invite TSPs, assign orders"
              onClick={() => router.push('/auth/signup/seller')}
            />
            <RoleCard
              icon="🚛"
              title="Transport Admin"
              description="Register trucks, fulfill orders"
              onClick={() => router.push('/auth/signup/transport')}
            />
            <RoleCard
              icon="🏪"
              title="Client"
              description="Place fuel orders, track deliveries"
              onClick={() => router.push('/auth/signup/client')}
            />
          </div>

          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              ℹ️ <strong>Note:</strong> Drivers are registered by Transport Admins
            </p>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={() => setView('login')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ===================== LANDING ===================== */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* HERO */}
      <section className="container mx-auto px-4 pt-28 pb-20 text-center">
        <span className="inline-block mb-4 rounded-full bg-blue-50 px-4 py-1 text-sm font-medium text-blue-700">
          Fuel Management Platform
        </span>

        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
          Fuel Monitoring System
        </h1>

        <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-10">
          Real-time fuel tracking, fleet visibility, secure delivery monitoring
          and role-based operations for <span className="font-medium">ANPTCO</span>.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => setView('choose-role')}
            className="bg-blue-600 text-white px-10 py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-lg"
          >
            Create Account
          </button>

          <button
            onClick={() => setView('login')}
            className="border border-blue-600 text-blue-600 px-10 py-3 rounded-xl font-semibold hover:bg-blue-50 transition"
          >
            Sign In
          </button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid gap-6 md:grid-cols-5">
          <FeatureCard icon="👨‍💼" title="Platform Admin"   description="System-wide control, sensor onboarding and live monitoring." />
          <FeatureCard icon="🏢" title="Seller Manager"   description="Manage depots, approve transporters and assign fuel orders." />
          <FeatureCard icon="🚛" title="Transport Admin"  description="Fleet registration, trip execution and delivery compliance." />
          <FeatureCard icon="👤" title="Driver"           description="Trip management, delivery tracking and status updates." />
          <FeatureCard icon="🏪" title="Client"           description="Fuel ordering, tracking and delivery transparency." />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-200 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-800">
          © {new Date().getFullYear()} Fuel Monitoring System · ANPTCO
        </div>
      </footer>
    </div>
  );
}

/* ===================== COMPONENTS ===================== */

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm hover:shadow-md transition">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function RoleCard({ icon, title, description, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="text-center p-8 bg-white border border-gray-200 rounded-xl transition hover:shadow-md hover:border-blue-500"
    >
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{description}</p>
      <span className="text-blue-600 font-medium text-sm">Create Account →</span>
    </button>
  );
}