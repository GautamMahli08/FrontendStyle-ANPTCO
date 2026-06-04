'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header  from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/demo-data';
import FleetMonitorView from '@/src/components/fleet/FleetMonitorView';

export default function TransportFleetMonitorPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getCurrentUser();
    if (!u || u.role !== 'TRANSPORT_ADMIN') { router.push('/'); return; }
    setUser(u);
  }, [router]);

  if (!mounted || !user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userRole={user.role} />
      <div className="flex-1 min-w-0">
        <Header user={user} />
        {/* Transporter owns trucks → filter by order or truck. */}
        <FleetMonitorView user={user} allowTruckFilter={true} />
      </div>
    </div>
  );
}
