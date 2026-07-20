'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EventsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp-client/dashboard?tab=events'); }, [router]);
  return null;
}
