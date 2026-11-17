import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Wealthwise — Track. Tag. Save.',
  description: 'AI-powered personal finance for India. Log in 5 seconds, tag what you needed, and save what you didn’t.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Wealthwise', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f7f4' }, { media: '(prefers-color-scheme: dark)', color: '#0b1110' }],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Applies the saved theme before first paint (no flash).
const themeScript = `try{var t=localStorage.getItem('ww-theme')||'system',a=localStorage.getItem('ww-accent')||'teal';if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');document.documentElement.dataset.accent=a}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
