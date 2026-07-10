'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Building2,
  KeyRound,
  ScrollText,
  Shield,
  Users,
  Mail,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const nav = [
  { href: '/identity/organizations', label: 'Organizations', icon: Building2 },
  { href: '/identity/users', label: 'Users', icon: Users },
  { href: '/identity/roles', label: 'Roles', icon: Shield },
  { href: '/identity/invitations', label: 'Invitations', icon: Mail },
  { href: '/identity/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/identity/audit', label: 'Audit', icon: ScrollText },
];

export function IdentityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-[var(--gain-border)] bg-[rgba(18,26,43,0.85)] backdrop-blur-md px-4 py-6 flex flex-col gap-8">
        <div>
          <div className="text-xs tracking-[0.2em] uppercase text-[var(--gain-text-muted)]">
            GAIN
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">
            Identity
          </div>
          <p className="mt-2 text-xs text-[var(--gain-text-muted)] leading-relaxed">
            Organizations, access control, and trust boundaries.
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
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
