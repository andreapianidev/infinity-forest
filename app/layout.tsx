import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infinite Forest',
  description: 'A first-person walk through a procedurally generated forest.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
