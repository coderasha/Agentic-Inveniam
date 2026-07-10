import { IdentityShell } from '@/components/identity-shell';

export default function IdentityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IdentityShell>{children}</IdentityShell>;
}
