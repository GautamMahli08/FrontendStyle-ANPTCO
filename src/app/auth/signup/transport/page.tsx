'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {

addUser,

setCurrentUser,

findUserByEmail,

} from '@/src/lib/demo-data';
import { User } from '@/src/types';

export default function TransportSignup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    companyName: '',
    phone: '',
    sellerCode:'',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
        setError('Please fill in all fields');
        return;
      }

      if (findUserByEmail(formData.email)) {
        setError('Email already registered');
        return;
      }

      setStep(2);
      return;
    }

    if (step === 2) {

      if (

!formData.companyName

||

!formData.phone

)
 {
        setError('Please fill in all fields');
        return;
      }

      setLoading(true);

      // Create user
      const userId = `transport-${Date.now()}`;

      const newUser: User = {
        id: userId,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'TRANSPORT_ADMIN',
        verified: true,
      };

      addUser(newUser);

// get saved user
const savedUser =
findUserByEmail(
formData.email
);

if(!savedUser){

setError(
'Failed to create account'
);

setLoading(false);

return;

}



setCurrentUser(
savedUser
);

      setLoading(false);
      setStep(3);

      setTimeout(() => {
        router.push('/transport/dashboard');
      }, 2000);
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-teal-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full text-center">
          <div className="animate-bounce mb-6">
            <span className="text-8xl">✅</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            Welcome, {formData.firstName}!<br />
            You can now register trucks and fulfill orders.
          </p>
          <div className="bg-green-50 p-4 rounded-lg text-sm text-left">
            <p className="font-semibold text-green-900 mb-2">Next Steps:</p>
            <ul className="space-y-1 text-green-800">
              <li>→ Upload KYC documents</li>
              <li>→ Wait for seller connection approval</li>
              <li>→ Register your trucks</li>
              <li>→ Create sensor integration tickets</li>
            </ul>
          </div>
          <p className="text-sm text-gray-500 mt-6">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-teal-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <button
          onClick={() => step === 1 ? router.push('/') : setStep(1)}
          className="text-green-600 hover:text-green-700 mb-6"
        >
          ← Back
        </button>

        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🚛</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Transport Account</h1>
          <p className="text-gray-600">Register trucks and deliver fuel</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className={`flex items-center ${step >= 1 ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-green-600 text-white' : 'bg-gray-300'}`}>
              1
            </div>
            <span className="ml-2 font-medium">Personal</span>
          </div>
          <div className={`w-16 h-1 mx-2 ${step >= 2 ? 'bg-green-600' : 'bg-gray-300'}`}></div>
          <div className={`flex items-center ${step >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-green-600 text-white' : 'bg-gray-300'}`}>
              2
            </div>
            <span className="ml-2 font-medium">Company</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Mohammed"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Rahman"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="mohammed@logistics.om"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transport Company Name *
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Speed Logistics LLC"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="+968 9234 5678"
                  required
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-900 mb-2">📋 Important</h4>
                <p className="text-sm text-yellow-800">
                  After registration, you'll need to:
                </p>
                <ul className="text-sm text-yellow-800 list-disc list-inside mt-2 space-y-1">
                  <li>Upload KYC documents (licenses, permits)</li>
                  <li>Wait for seller approval</li>
                  <li>Register trucks with compartment details</li>
                </ul>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating Account...' : step === 1 ? 'Continue' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/')} className="text-green-600 hover:text-green-700 font-medium">
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
