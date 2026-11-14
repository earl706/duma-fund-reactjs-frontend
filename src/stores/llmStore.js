import { create } from 'zustand';

import { api } from '../lib/api';

const LEGACY_STORAGE_KEY = 'dumafund.llm';

export const LLM_PROVIDERS = ['openai', 'gemini', 'groq', 'openrouter'];

export const DEFAULT_LLM_CONFIG = {
	provider: 'openai',
	openaiModel: 'gpt-4o-mini',
	geminiModel: 'gemini-3.5-flash',
	groqModel: 'qwen/qwen3.8-27b',
	openrouterModel: 'nvidia/nemotron-3.5-super-vl:free',
	openaiKeySet: false,
	openaiKeyHint: '',
	geminiKeySet: false,
	geminiKeyHint: '',
	groqKeySet: false,
	groqKeyHint: '',
	openrouterKeySet: false,
	openrouterKeyHint: ''
};

const KEY_SET_BY_PROVIDER = {
	openai: 'openaiKeySet',
	gemini: 'geminiKeySet',
	groq: 'groqKeySet',
	openrouter: 'openrouterKeySet'
};

const MODEL_BY_PROVIDER = {
	openai: 'openaiModel',
	gemini: 'geminiModel',
	groq: 'groqModel',
	openrouter: 'openrouterModel'
};

function pickModel(data, apiKey, defaultValue) {
	return typeof data?.[apiKey] === 'string' && data[apiKey].trim()
		? data[apiKey].trim()
		: defaultValue;
}

function mapServerPayload(data) {
	const provider = LLM_PROVIDERS.includes(data?.provider)
		? data.provider
		: DEFAULT_LLM_CONFIG.provider;
	return {
		provider,
		openaiModel: pickModel(data, 'openai_model', DEFAULT_LLM_CONFIG.openaiModel),
		geminiModel: pickModel(data, 'gemini_model', DEFAULT_LLM_CONFIG.geminiModel),
		groqModel: pickModel(data, 'groq_model', DEFAULT_LLM_CONFIG.groqModel),
		openrouterModel: pickModel(data, 'openrouter_model', DEFAULT_LLM_CONFIG.openrouterModel),
		openaiKeySet: Boolean(data?.openai_key_set),
		openaiKeyHint: typeof data?.openai_key_hint === 'string' ? data.openai_key_hint : '',
		geminiKeySet: Boolean(data?.gemini_key_set),
		geminiKeyHint: typeof data?.gemini_key_hint === 'string' ? data.gemini_key_hint : '',
		groqKeySet: Boolean(data?.groq_key_set),
		groqKeyHint: typeof data?.groq_key_hint === 'string' ? data.groq_key_hint : '',
		openrouterKeySet: Boolean(data?.openrouter_key_set),
		openrouterKeyHint: typeof data?.openrouter_key_hint === 'string' ? data.openrouter_key_hint : ''
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
	if (server.openaiKeySet || server.geminiKeySet || server.groqKeySet || server.openrouterKeySet) {
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

async function patchProviderSettings(
	set,
	{ apiKeyField, modelField, stateModelKey, defaultModel, label, apiKey, model }
) {
	const body = {};
	if (apiKey !== undefined) {
		const trimmed = String(apiKey).trim();
		if (trimmed) body[apiKeyField] = trimmed;
	}
	if (model !== undefined) {
		const trimmed = String(model).trim();
		body[modelField] = trimmed || defaultModel;
		set({ [stateModelKey]: body[modelField] });
	}
	if (!Object.keys(body).length) return;
	try {
		const { data } = await api.patch('/auth/llm/', body);
		set({ ...mapServerPayload(data), status: 'ready', error: null });
	} catch (err) {
		set({ error: err?.message || `Could not save ${label} settings.` });
		throw err;
	}
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
			set({
				status: 'error',
				error: err?.message || 'Could not load Receipt AI settings.'
			});
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
		return patchProviderSettings(set, {
			apiKeyField: 'openai_api_key',
			modelField: 'openai_model',
			stateModelKey: 'openaiModel',
			defaultModel: DEFAULT_LLM_CONFIG.openaiModel,
			label: 'OpenAI',
			apiKey,
			model
		});
	},

	async setGemini({ apiKey, model } = {}) {
		return patchProviderSettings(set, {
			apiKeyField: 'gemini_api_key',
			modelField: 'gemini_model',
			stateModelKey: 'geminiModel',
			defaultModel: DEFAULT_LLM_CONFIG.geminiModel,
			label: 'Gemini',
			apiKey,
			model
		});
	},

	async setGroq({ apiKey, model } = {}) {
		return patchProviderSettings(set, {
			apiKeyField: 'groq_api_key',
			modelField: 'groq_model',
			stateModelKey: 'groqModel',
			defaultModel: DEFAULT_LLM_CONFIG.groqModel,
			label: 'Groq',
			apiKey,
			model
		});
	},

	async setOpenRouter({ apiKey, model } = {}) {
		return patchProviderSettings(set, {
			apiKeyField: 'openrouter_api_key',
			modelField: 'openrouter_model',
			stateModelKey: 'openrouterModel',
			defaultModel: DEFAULT_LLM_CONFIG.openrouterModel,
			label: 'OpenRouter',
			apiKey,
			model
		});
	},

	async clearKeys(provider) {
		const params = provider && LLM_PROVIDERS.includes(provider) ? { provider } : undefined;
		try {
			const { data } = await api.delete('/auth/llm/keys/', { params });
			set({ ...mapServerPayload(data), status: 'ready', error: null });
		} catch (err) {
			set({ error: err?.message || 'Could not clear keys.' });
			throw err;
		}
	}
}));

/** True when the active provider has an account-saved key (server uses it on scan). */
export function hasActiveLlmKey() {
	const state = useLlmStore.getState();
	const key = KEY_SET_BY_PROVIDER[state.provider];
	return key ? Boolean(state[key]) : false;
}

/** @deprecated Prefer hasActiveLlmKey; kept for callers that only gate UI. */
export function getActiveLlmCredentials() {
	if (!hasActiveLlmKey()) return null;
	const state = useLlmStore.getState();
	const modelKey = MODEL_BY_PROVIDER[state.provider];
	const defaultModel = DEFAULT_LLM_CONFIG[modelKey];
	return {
		provider: state.provider,
		apiKey: '',
		model: (state[modelKey] || defaultModel).trim()
	};
}
