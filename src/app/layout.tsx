import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fuel Fleet Management',
  description: 'Complete fuel fleet management workflow demo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
