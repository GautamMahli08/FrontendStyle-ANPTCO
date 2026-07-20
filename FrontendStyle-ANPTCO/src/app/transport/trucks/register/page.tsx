'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';

export default function RegisterTruckPage() {
  const router = useRouter();
  const user = getCurrentUser();
  useEffect(() => { if (!user) router.replace('/auth/login'); }, [router, user]);
  if (!user) return null;
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="TRANSPORT_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Register Truck" user={user} />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-3">🛰️</div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Truck Onboarding Pending</h2>
            <p className="text-slate-400 text-sm">
              Trucks are added to your fleet through a sensor-integration review (seller, then platform admin
              approval) — there is no direct registration form. This review flow is not yet available in the app.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
