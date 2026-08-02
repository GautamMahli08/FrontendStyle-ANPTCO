'use client';
import { useRouter } from 'next/navigation';

export default function SellerSignup() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="text-6xl mb-5">🏢</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Seller Account</h1>
        <p className="text-gray-500 text-sm mb-6">
          Seller accounts are provisioned by the ANPTCO platform team.
          Self-registration is not available for this role.
        </p>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-left mb-6 space-y-3 text-sm text-blue-900">
          <p className="font-semibold text-blue-800">To get a Seller account:</p>
          <ul className="space-y-1.5 text-blue-700">
            <li className="flex items-start gap-2"><span>1.</span><span>Contact ANPTCO admin at <strong>admin@anptco.com</strong></span></li>
            <li className="flex items-start gap-2"><span>2.</span><span>Provide your company registration and contact details</span></li>
            <li className="flex items-start gap-2"><span>3.</span><span>Admin creates your workspace and sends login credentials</span></li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push('/auth/login')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Go to Login
          </button>
          <button
            onClick={() => router.back()}
            className="w-full border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium py-3 rounded-xl transition-colors text-sm"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
