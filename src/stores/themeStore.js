import { create } from 'zustand';

const STORAGE_KEY = 'dumafund.theme';

const BASE = import.meta.env.BASE_URL || '/';
const ICON_HREF = {
	light: `${BASE}light-icon.png`,
	dark: `${BASE}dark-icon.png`
};

function getInitialTheme() {
	if (typeof window === 'undefined') return 'light';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	// Fall back to the OS preference.
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ensureHeadLink(rel) {
	let el = document.querySelector(`link[rel="${rel}"]`);
	if (!el) {
		el = document.createElement('link');
		el.rel = rel;
		document.head.appendChild(el);
	}
	return el;
}

function applyBrandIcons(theme) {
	if (typeof document === 'undefined') return;
	const href = ICON_HREF[theme === 'dark' ? 'dark' : 'light'];
	const icon = ensureHeadLink('icon');
	icon.type = 'image/png';
	icon.href = href;
	const apple = ensureHeadLink('apple-touch-icon');
	apple.href = href;
}

function applyTheme(theme) {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle('dark', theme === 'dark');
	document.documentElement.style.colorScheme = theme;
	applyBrandIcons(theme);
}

export const useThemeStore = create((set, get) => ({
	theme: getInitialTheme(),

	init() {
		applyTheme(get().theme);
	},

	toggle() {
		const next = get().theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem(STORAGE_KEY, next);
		applyTheme(next);
		set({ theme: next });
	},

	setTheme(theme) {
		localStorage.setItem(STORAGE_KEY, theme);
		applyTheme(theme);
		set({ theme });
	}
}));
