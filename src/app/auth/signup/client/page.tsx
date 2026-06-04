'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addUser, setCurrentUser, findUserByEmail, DELIVERY_ZONES  } from '@/src/lib/demo-data';
import { User } from '@/src/types';

export default function ClientSignup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    stationName: '',
    phone: '',
    selectedLocation: '',
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
      if (!formData.stationName || !formData.phone || !formData.selectedLocation) {
        setError('Please fill in all fields and select a location');
        return;
      }

      setLoading(true);

      const userId = `client-${Date.now()}`;

      const newUser: User = {
        id: userId,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'CLIENT',
        verified: true,
      };

      addUser(newUser);
      setCurrentUser(newUser);

      setLoading(false);
      setStep(3);

      setTimeout(() => {
        router.push('/client/dashboard');
      }, 2000);
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full text-center">
          <div className="animate-bounce mb-6">
            <span className="text-8xl">✅</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            Welcome, {formData.firstName}!<br />
            You can now place fuel orders.
          </p>
          <div className="bg-orange-50 p-4 rounded-lg text-sm text-left">
            <p className="font-semibold text-orange-900 mb-2">Next Steps:</p>
            <ul className="space-y-1 text-orange-800">
              <li>→ Place your first fuel order</li>
              <li>→ Track delivery in real-time</li>
              <li>→ Scan QR code to accept delivery</li>
              <li>→ View delivery history</li>
            </ul>
          </div>
          <p className="text-sm text-gray-500 mt-6">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <button
          onClick={() => step === 1 ? router.push('/') : setStep(1)}
          className="text-orange-600 hover:text-orange-700 mb-6"
        >
          ← Back
        </button>

        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏪</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Client Account</h1>
          <p className="text-gray-600">Order fuel for your station</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className={`flex items-center ${step >= 1 ? 'text-orange-600' : 'text-gray-400'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-orange-600 text-white' : 'bg-gray-300'}`}>
              1
            </div>
            <span className="ml-2 font-medium">Personal</span>
          </div>
          <div className={`w-16 h-1 mx-2 ${step >= 2 ? 'bg-orange-600' : 'bg-gray-300'}`}></div>
          <div className={`flex items-center ${step >= 2 ? 'text-orange-600' : 'text-gray-400'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-orange-600 text-white' : 'bg-gray-300'}`}>
              2
            </div>
            <span className="ml-2 font-medium">Station</span>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Fatima"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Al-Hashmi"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="fatima@station.om"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  Station Name *
                </label>
                <input
                  type="text"
                  value={formData.stationName}
                  onChange={(e) => setFormData({ ...formData, stationName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="My Petrol Station"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="+968 9345 6789"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Your Station Location *
                </label>
                <select
                  value={formData.selectedLocation}
                  onChange={(e) => setFormData({ ...formData, selectedLocation: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                >
                  <option value="">Choose location...</option>
                  {DELIVERY_ZONES.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} - {zone.clientName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select from available delivery zones in Muscat
                </p>
              </div>

              {formData.selectedLocation && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">📍 Selected Location</h4>
                  {DELIVERY_ZONES.filter(z => z.id === formData.selectedLocation).map((zone) => (
                    <div key={zone.id} className="text-sm text-blue-800">
                      <p><strong>{zone.name}</strong></p>
                      <p>{zone.address}</p>
                      <p className="text-xs mt-1">
                        Coords: {zone.lat}, {zone.lng}<br />
                        Delivery radius: {zone.radius}m
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating Account...' : step === 1 ? 'Continue' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/')} className="text-orange-600 hover:text-orange-700 font-medium">
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
