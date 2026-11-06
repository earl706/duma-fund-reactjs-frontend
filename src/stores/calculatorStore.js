import { create } from 'zustand';

/**
 * Ephemeral money-helper state: sheet open, last money-field bind, memory slot.
 * Engine display state lives in MoneyCalculatorSheet.
 */
export const useCalculatorStore = create((set, get) => ({
	open: false,
	seedToken: 0,
	seedValue: null,
	seedFromBind: false,
	memory: null,
	/** @type {{ id: string, label?: string, value: string, onApply: (v: string) => void, clampNonNegative?: boolean } | null} */
	bind: null,

	setBind(bind) {
		set({ bind });
	},

	clearBind(id) {
		const current = get().bind;
		if (!current) return;
		if (id == null || current.id === id) set({ bind: null });
	},

	openCalculator({ seedFromBind = false, seedValue = null } = {}) {
		const bind = get().bind;
		const resolvedSeed = seedValue != null ? seedValue : seedFromBind && bind ? bind.value : null;
		set((s) => ({
			open: true,
			seedFromBind: Boolean(seedFromBind || seedValue != null),
			seedValue: resolvedSeed,
			seedToken: s.seedToken + 1
		}));
	},

	closeCalculator() {
		set({ open: false, seedFromBind: false, seedValue: null });
	},

	memoryAdd(n) {
		const value = Number(n);
		if (!Number.isFinite(value)) return;
		const prev = get().memory;
		set({ memory: (prev == null ? 0 : prev) + value });
	},

	memoryRecall() {
		return get().memory;
	},

	memoryClear() {
		set({ memory: null });
	}
}));
