import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type IdentityUiState = {
  organizationId: string | null;
  setOrganizationId: (id: string | null) => void;
};

export const useIdentityStore = create<IdentityUiState>()(
  persist(
    (set) => ({
      organizationId: null,
      setOrganizationId: (id) => set({ organizationId: id }),
    }),
    { name: 'gain-identity-ui' },
  ),
);
