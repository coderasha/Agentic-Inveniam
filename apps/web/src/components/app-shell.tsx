'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Building2,
  Boxes,
  KeyRound,
  ScrollText,
  Shield,
  Users,
  Mail,
  LogOut,
  Network,
  FileText,
  Landmark,
  GitBranch,
  Bell,
  Share2,
  Fingerprint,
  BadgeCheck,
  Calculator,
  Coins,
  Store,
  Briefcase,
  Contact,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const nav = [
  {
    section: 'Identity',
    items: [
      { href: '/identity/organizations', label: 'Organizations', icon: Building2 },
      { href: '/identity/users', label: 'Users', icon: Users },
      { href: '/identity/roles', label: 'Roles', icon: Shield },
      { href: '/identity/invitations', label: 'Invitations', icon: Mail },
      { href: '/identity/api-keys', label: 'API Keys', icon: KeyRound },
      { href: '/identity/audit', label: 'Audit', icon: ScrollText },
    ],
  },
  {
    section: 'Digital Twins',
    items: [
      { href: '/twins', label: 'Twins', icon: Boxes },
      { href: '/twins/graph', label: 'Twin links', icon: Network },
    ],
  },
  {
    section: 'Platform',
    items: [
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/assets', label: 'Assets', icon: Landmark },
      { href: '/portfolios', label: 'Portfolios', icon: Briefcase },
      { href: '/crm', label: 'Investor CRM', icon: Contact },
      { href: '/compliance', label: 'Compliance', icon: Scale },
      { href: '/valuations', label: 'Valuations', icon: Calculator },
      { href: '/tokenization', label: 'Tokenization', icon: Coins },
      { href: '/marketplace', label: 'Marketplace', icon: Store },
      { href: '/graph', label: 'Knowledge Graph', icon: Share2 },
      { href: '/provenance', label: 'Provenance', icon: Fingerprint },
      { href: '/trust', label: 'Trust', icon: BadgeCheck },
      { href: '/workflows', label: 'Workflows', icon: GitBranch },
      { href: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

export function AppShell({
  children,
  title = 'GAIN',
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-[var(--gain-border)] bg-[rgba(18,26,43,0.85)] backdrop-blur-md px-4 py-6 flex flex-col gap-8">
        <div>
          <div className="text-xs tracking-[0.2em] uppercase text-[var(--gain-text-muted)]">
            Global Asset Intelligence
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{title}</div>
        </div>
        <nav className="flex flex-col gap-5">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="mb-2 px-3 text-[10px] uppercase tracking-[0.18em] text-[var(--gain-text-muted)]">
                {group.section}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== '/twins' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
                        active
                          ? 'bg-[rgba(61,139,253,0.16)] text-[var(--gain-text)]'
                          : 'text-[var(--gain-text-muted)] hover:bg-[var(--gain-bg-soft)] hover:text-[var(--gain-text)]',
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--gain-border)] pt-4">
          <div className="text-xs text-[var(--gain-text-muted)] truncate">
            {session?.user?.email ?? 'Not signed in'}
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start px-2"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="px-8 py-7">{children}</main>
    </div>
  );
}
