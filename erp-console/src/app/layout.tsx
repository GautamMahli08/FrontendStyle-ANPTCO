import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ANPTCO Dispatch Console',
  description: 'ERP dispatch integration for ANPTCO fuel logistics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-100 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
