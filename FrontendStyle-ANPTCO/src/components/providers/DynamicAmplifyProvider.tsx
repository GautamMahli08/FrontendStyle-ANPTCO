'use client';
import dynamic from 'next/dynamic';

const AmplifyProvider = dynamic(
  () => import('./AmplifyProvider'),
  { ssr: false, loading: () => null },
);

export default function DynamicAmplifyProvider({ children }: { children: React.ReactNode }) {
  return <AmplifyProvider>{children}</AmplifyProvider>;
}
