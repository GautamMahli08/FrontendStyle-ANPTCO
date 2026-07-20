'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TripsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp-client/dashboard?tab=trips'); }, [router]);
  return null;
}
