'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveStatusPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp-client/dashboard?tab=live'); }, [router]);
  return null;
}
