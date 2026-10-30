import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIAL Winner | 먀미의 식사 배틀 & AI 맛 심사',
  description: '먀미의 식사 사진 중 AI가 가장 맛있는 음식(WIN)을 가려내는 미식 배틀 플랫폼',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
