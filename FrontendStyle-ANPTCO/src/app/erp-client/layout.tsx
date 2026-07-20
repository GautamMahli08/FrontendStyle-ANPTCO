'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import { getCurrentUser } from '@/src/lib/auth';
import type { User } from '@/src/types';

export default function ERPClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'ERP_CLIENT') {
        router.replace('/auth/login');
      } else {
        setUser(u);
      }
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="ERP_CLIENT" />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
