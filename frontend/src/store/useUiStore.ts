import { create } from "zustand";

// Placeholder Zustand store proving the state-management wiring works.
// Real app-level stores (e.g. selected author/fic filters) belong here
// once Discovery/Planning define the actual UI state.
interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
