import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-gain-sans',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-gain-mono',
});

export const metadata: Metadata = {
  title: 'GAIN — Identity',
  description: 'Global Asset Intelligence Network Identity Console',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body style={{ fontFamily: 'var(--font-gain-sans), var(--gain-font-sans)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
