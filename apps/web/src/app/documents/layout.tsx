import { AppShell } from '@/components/app-shell';

export default function PlatformSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
