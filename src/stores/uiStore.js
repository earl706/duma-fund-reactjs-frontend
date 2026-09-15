import { create } from 'zustand';

/** Ephemeral UI state: sidebar, command palette, and receipt scan modal. */
export const useUIStore = create((set) => ({
	sidebarOpen: false,
	paletteOpen: false,
	scanOpen: false,

	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	closeSidebar: () => set({ sidebarOpen: false }),
	openPalette: () => set({ paletteOpen: true }),
	closePalette: () => set({ paletteOpen: false }),
	togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
	openScan: () => set({ scanOpen: true }),
	closeScan: () => set({ scanOpen: false })
}));
