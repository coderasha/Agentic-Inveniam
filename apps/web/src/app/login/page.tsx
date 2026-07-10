'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--gain-border)] bg-[rgba(18,26,43,0.85)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="text-xs tracking-[0.22em] uppercase text-[var(--gain-text-muted)]">
          Global Asset Intelligence Network
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">GAIN</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--gain-text-muted)]">
          Sign in to the Identity console to manage organizations, roles, and
          trust boundaries for every private asset.
        </p>
        <Button
          className="mt-8 w-full"
          onClick={() => signIn('keycloak', { callbackUrl: '/identity/organizations' })}
        >
          Continue with Keycloak
        </Button>
      </div>
    </div>
  );
}
