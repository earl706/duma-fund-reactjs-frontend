import { create } from 'zustand';

import { applyHistoryCommand } from '../lib/transactionHistory';
import { toast } from './toastStore';

export const HISTORY_CAP = 100;

function resolveThroughMap(idMap, id) {
	if (id == null) return id;
	let cur = id;
	const seen = new Set();
	while (idMap[cur] != null && idMap[cur] !== cur) {
		if (seen.has(cur)) break;
		seen.add(cur);
		cur = idMap[cur];
	}
	return cur;
}

/**
 * Client-side undo/redo stack for Transactions ledger mutations.
 * Commands are executed via applyHistoryCommand (API); ids remapped after recreate.
 */
export const useLedgerHistoryStore = create((set, get) => ({
	past: [],
	future: [],
	idMap: {},
	busy: false,
	profileId: null,

	resolveId(id) {
		return resolveThroughMap(get().idMap, id);
	},

	remapId(fromId, toId) {
		if (fromId == null || toId == null || fromId === toId) return;
		set((s) => ({ idMap: { ...s.idMap, [fromId]: toId } }));
	},

	bindProfile(profileId) {
		const cur = get().profileId;
		if (cur === profileId) return;
		set({
			profileId,
			past: [],
			future: [],
			idMap: {},
			busy: false
		});
	},

	clear() {
		set({ past: [], future: [], idMap: {}, busy: false });
	},

	push(command) {
		if (!command?.type) return;
		set((s) => {
			const past = [...s.past, command];
			while (past.length > HISTORY_CAP) past.shift();
			return { past, future: [] };
		});
	},

	canUndo() {
		const s = get();
		return !s.busy && s.past.length > 0;
	},

	canRedo() {
		const s = get();
		return !s.busy && s.future.length > 0;
	},

	async undo() {
		const s = get();
		if (s.busy || !s.past.length) return false;
		const command = s.past[s.past.length - 1];
		set({ busy: true, past: s.past.slice(0, -1) });
		try {
			await applyHistoryCommand(command, 'undo', {
				resolveId: (id) => get().resolveId(id),
				remapId: (from, to) => get().remapId(from, to)
			});
			set((state) => {
				const future = [command, ...state.future];
				while (future.length > HISTORY_CAP) future.pop();
				return { future, busy: false };
			});
			return true;
		} catch {
			toast.error('Could not undo.');
			set({ busy: false });
			return false;
		}
	},

	async redo() {
		const s = get();
		if (s.busy || !s.future.length) return false;
		const command = s.future[0];
		set({ busy: true, future: s.future.slice(1) });
		try {
			await applyHistoryCommand(command, 'redo', {
				resolveId: (id) => get().resolveId(id),
				remapId: (from, to) => get().remapId(from, to)
			});
			set((state) => {
				const past = [...state.past, command];
				while (past.length > HISTORY_CAP) past.shift();
				return { past, busy: false };
			});
			return true;
		} catch {
			toast.error('Could not redo.');
			set({ busy: false });
			return false;
		}
	}
}));
