'use client';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Create Account</h1>
        <p className="text-center text-sm text-gray-500 mb-6">Choose your account type to get started</p>
        <div className="space-y-3">
          <button
            onClick={() => router.push('/auth/signup/client')}
            className="w-full py-4 px-5 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-400 text-left rounded-xl transition-all group"
          >
            <div className="font-semibold text-gray-800 group-hover:text-blue-600">🏭 Client</div>
            <div className="text-xs text-gray-400 mt-0.5">Order fuel and manage deliveries</div>
          </button>

          {/* Seller and transport accounts are admin-provisioned */}
          {[
            { label: '🏢 Seller Manager',  sub: 'Manage fuel inventory and orders', path: '/auth/signup/seller'    },
            { label: '🚛 Transport Admin', sub: 'Manage fleet and drivers',         path: '/auth/signup/transport' },
          ].map(({ label, sub, path }) => (
            <button
              key={path}
              onClick={() => router.push(path)}
              className="w-full py-4 px-5 bg-white hover:bg-slate-50 border border-gray-200 text-left rounded-xl transition-all group"
            >
              <div className="font-semibold text-gray-700">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/')} className="text-blue-600 hover:underline font-medium">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}