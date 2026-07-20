'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';

export default function KycReviewPage() {
  const router = useRouter();
  const user = getCurrentUser();
  useEffect(() => { if (!user) router.replace('/auth/login'); }, [router, user]);
  if (!user) return null;
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="SELLER_MANAGER" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="KYC Review" user={user} />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-4xl mb-3">🚧</div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Coming Soon</h2>
            <p className="text-slate-400 text-sm">This feature will be available in a future release.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
