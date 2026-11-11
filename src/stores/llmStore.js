import { create } from 'zustand';

import { api } from '../lib/api';

const LEGACY_STORAGE_KEY = 'dumafund.llm';

export const LLM_PROVIDERS = ['openai', 'gemini'];

export const DEFAULT_LLM_CONFIG = {
	provider: 'openai',
	openaiModel: 'gpt-4o-mini',
	geminiModel: 'gemini-3.5-flash',
	openaiKeySet: false,
	openaiKeyHint: '',
	geminiKeySet: false,
	geminiKeyHint: ''
};

function mapServerPayload(data) {
	const provider = LLM_PROVIDERS.includes(data?.provider)
		? data.provider
		: DEFAULT_LLM_CONFIG.provider;
	return {
		provider,
		openaiModel:
			typeof data?.openai_model === 'string' && data.openai_model.trim()
				? data.openai_model.trim()
				: DEFAULT_LLM_CONFIG.openaiModel,
		geminiModel:
			typeof data?.gemini_model === 'string' && data.gemini_model.trim()
				? data.gemini_model.trim()
				: DEFAULT_LLM_CONFIG.geminiModel,
		openaiKeySet: Boolean(data?.openai_key_set),
		openaiKeyHint: typeof data?.openai_key_hint === 'string' ? data.openai_key_hint : '',
		geminiKeySet: Boolean(data?.gemini_key_set),
		geminiKeyHint: typeof data?.gemini_key_hint === 'string' ? data.gemini_key_hint : ''
	};
}

function readLegacyLocalKeys() {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return {
			provider: LLM_PROVIDERS.includes(parsed?.provider)
				? parsed.provider
				: DEFAULT_LLM_CONFIG.provider,
			openaiApiKey: typeof parsed?.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : '',
			openaiModel:
				typeof parsed?.openaiModel === 'string' && parsed.openaiModel.trim()
					? parsed.openaiModel.trim()
					: DEFAULT_LLM_CONFIG.openaiModel,
			geminiApiKey: typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '',
			geminiModel:
				typeof parsed?.geminiModel === 'string' && parsed.geminiModel.trim()
					? parsed.geminiModel.trim()
					: DEFAULT_LLM_CONFIG.geminiModel
		};
	} catch {
		return null;
	}
}

function clearLegacyLocalKeys() {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(LEGACY_STORAGE_KEY);
	} catch {
		/* ignore */
	}
}

async function migrateLegacyIfNeeded(server) {
	if (server.openaiKeySet || server.geminiKeySet) {
		clearLegacyLocalKeys();
		return server;
	}
	const legacy = readLegacyLocalKeys();
	if (!legacy) return server;
	const body = {
		provider: legacy.provider,
		openai_model: legacy.openaiModel,
		gemini_model: legacy.geminiModel
	};
	if (legacy.openaiApiKey) body.openai_api_key = legacy.openaiApiKey;
	if (legacy.geminiApiKey) body.gemini_api_key = legacy.geminiApiKey;
	if (!body.openai_api_key && !body.gemini_api_key) {
		clearLegacyLocalKeys();
		const { data } = await api.patch('/auth/llm/', {
			provider: legacy.provider,
			openai_model: legacy.openaiModel,
			gemini_model: legacy.geminiModel
		});
		return mapServerPayload(data);
	}
	const { data } = await api.patch('/auth/llm/', body);
	clearLegacyLocalKeys();
	return mapServerPayload(data);
}

export const useLlmStore = create((set) => ({
	...DEFAULT_LLM_CONFIG,
	status: 'idle',
	error: null,

	async hydrateFromServer() {
		set({ status: 'loading', error: null });
		try {
			const { data } = await api.get('/auth/llm/');
			let next = mapServerPayload(data);
			next = await migrateLegacyIfNeeded(next);
			set({ ...next, status: 'ready', error: null });
			return next;
		} catch (err) {
			set({ status: 'error', error: err?.message || 'Could not load Receipt AI settings.' });
			return null;
		}
	},

	reset() {
		set({ ...DEFAULT_LLM_CONFIG, status: 'idle', error: null });
	},

	async setProvider(provider) {
		if (!LLM_PROVIDERS.includes(provider)) return;
		set({ provider });
		try {
			const { data } = await api.patch('/auth/llm/', { provider });
			set({ ...mapServerPayload(data), status: 'ready', error: null });
		} catch (err) {
			set({ error: err?.message || 'Could not save provider.' });
		}
	},

	async setOpenAI({ apiKey, model } = {}) {
		const body = {};
		if (apiKey !== undefined) {
			const trimmed = String(apiKey).trim();
			if (trimmed) body.openai_api_key = trimmed;
		}
		if (model !== undefined) {
			const trimmed = String(model).trim();
			body.openai_model = trimmed || DEFAULT_LLM_CONFIG.openaiModel;
			set({ openaiModel: body.openai_model });
		}
		if (!Object.keys(body).length) return;
		try {
			const { data } = await api.patch('/auth/llm/', body);
			set({ ...mapServerPayload(data), status: 'ready', error: null });
		} catch (err) {
			set({ error: err?.message || 'Could not save OpenAI settings.' });
			throw err;
		}
	},

	async setGemini({ apiKey, model } = {}) {
		const body = {};
		if (apiKey !== undefined) {
			const trimmed = String(apiKey).trim();
			if (trimmed) body.gemini_api_key = trimmed;
		}
		if (model !== undefined) {
			const trimmed = String(model).trim();
			body.gemini_model = trimmed || DEFAULT_LLM_CONFIG.geminiModel;
			set({ geminiModel: body.gemini_model });
		}
		if (!Object.keys(body).length) return;
		try {
			const { data } = await api.patch('/auth/llm/', body);
			set({ ...mapServerPayload(data), status: 'ready', error: null });
		} catch (err) {
			set({ error: err?.message || 'Could not save Gemini settings.' });
			throw err;
		}
	},

	async clearKeys() {
		try {
			const { data } = await api.delete('/auth/llm/keys/');
			set({ ...mapServerPayload(data), status: 'ready', error: null });
		} catch (err) {
			set({ error: err?.message || 'Could not clear keys.' });
			throw err;
		}
	}
}));

/** True when the active provider has an account-saved key (server uses it on scan). */
export function hasActiveLlmKey() {
	const { provider, openaiKeySet, geminiKeySet } = useLlmStore.getState();
	return provider === 'gemini' ? geminiKeySet : openaiKeySet;
}

/** @deprecated Prefer hasActiveLlmKey; kept for callers that only gate UI. */
export function getActiveLlmCredentials() {
	if (!hasActiveLlmKey()) return null;
	const { provider, openaiModel, geminiModel } = useLlmStore.getState();
	if (provider === 'gemini') {
		return {
			provider: 'gemini',
			apiKey: '',
			model: (geminiModel || DEFAULT_LLM_CONFIG.geminiModel).trim()
		};
	}
	return {
		provider: 'openai',
		apiKey: '',
		model: (openaiModel || DEFAULT_LLM_CONFIG.openaiModel).trim()
	};
}
