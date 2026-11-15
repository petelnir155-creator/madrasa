import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'הערבית המדוברת של ניר',
  description: 'ערבית מדוברת (לבנטינית): חזרות מרווחות, שליפה אקטיבית ומשפטים אישיים',
};

export const viewport: Viewport = { themeColor: '#0f1419', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
