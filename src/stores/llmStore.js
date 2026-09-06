import { create } from 'zustand';

const STORAGE_KEY = 'dumafund.llm';

export const LLM_PROVIDERS = ['openai', 'gemini'];

export const DEFAULT_LLM_CONFIG = {
	provider: 'openai',
	openaiApiKey: '',
	openaiModel: 'gpt-4o-mini',
	geminiApiKey: '',
	geminiModel: 'gemini-3.6-flash'
};

function loadConfig() {
	if (typeof window === 'undefined') return { ...DEFAULT_LLM_CONFIG };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_LLM_CONFIG };
		const parsed = JSON.parse(raw);
		const provider = LLM_PROVIDERS.includes(parsed?.provider)
			? parsed.provider
			: DEFAULT_LLM_CONFIG.provider;
		return {
			provider,
			openaiApiKey: typeof parsed?.openaiApiKey === 'string' ? parsed.openaiApiKey : '',
			openaiModel:
				typeof parsed?.openaiModel === 'string' && parsed.openaiModel.trim()
					? parsed.openaiModel.trim()
					: DEFAULT_LLM_CONFIG.openaiModel,
			geminiApiKey: typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey : '',
			geminiModel:
				typeof parsed?.geminiModel === 'string' && parsed.geminiModel.trim()
					? parsed.geminiModel.trim()
					: DEFAULT_LLM_CONFIG.geminiModel
		};
	} catch {
		return { ...DEFAULT_LLM_CONFIG };
	}
}

function persist(state) {
	if (typeof window === 'undefined') return;
	const { provider, openaiApiKey, openaiModel, geminiApiKey, geminiModel } = state;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			provider,
			openaiApiKey,
			openaiModel,
			geminiApiKey,
			geminiModel
		})
	);
}

export const useLlmStore = create((set, get) => ({
	...loadConfig(),

	setProvider(provider) {
		if (!LLM_PROVIDERS.includes(provider)) return;
		const next = { ...get(), provider };
		persist(next);
		set({ provider });
	},

	setOpenAI({ apiKey, model } = {}) {
		const patch = {};
		if (apiKey !== undefined) patch.openaiApiKey = String(apiKey);
		if (model !== undefined) {
			const trimmed = String(model).trim();
			patch.openaiModel = trimmed || DEFAULT_LLM_CONFIG.openaiModel;
		}
		if (!Object.keys(patch).length) return;
		const next = { ...get(), ...patch };
		persist(next);
		set(patch);
	},

	setGemini({ apiKey, model } = {}) {
		const patch = {};
		if (apiKey !== undefined) patch.geminiApiKey = String(apiKey);
		if (model !== undefined) {
			const trimmed = String(model).trim();
			patch.geminiModel = trimmed || DEFAULT_LLM_CONFIG.geminiModel;
		}
		if (!Object.keys(patch).length) return;
		const next = { ...get(), ...patch };
		persist(next);
		set(patch);
	},

	clearKeys() {
		const patch = { openaiApiKey: '', geminiApiKey: '' };
		const next = { ...get(), ...patch };
		persist(next);
		set(patch);
	}
}));
