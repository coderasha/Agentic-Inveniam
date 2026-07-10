import { AppShell } from '@/components/app-shell';

export default function TwinsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="GAIN">{children}</AppShell>;
}
