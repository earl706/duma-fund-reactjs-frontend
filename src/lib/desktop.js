function envFlag(value) {
	return ['1', 'true', 'yes'].includes(
		String(value || '')
			.trim()
			.toLowerCase()
	);
}

function isTauriRuntime() {
	if (typeof window === 'undefined') return false;
	return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

/** True when the SPA was built for the iOS prototype (VITE_MOBILE=1). */
export function isMobileApp() {
	// Vite only inlines static import.meta.env.VITE_* access in production.
	return envFlag(import.meta.env.VITE_MOBILE);
}

/** Tailwind `lg` boundary — mobile shell below this width (max-width: 1023px). */
export const MOBILE_LAYOUT_MQ = '(max-width: 1023px)';

/**
 * Sync layout signal: iOS build always, otherwise viewport below `lg`.
 * Prefer useMobileLayout() in React components so resize re-renders.
 */
export function isMobileLayout() {
	if (isMobileApp()) return true;
	if (typeof window === 'undefined') return false;
	return window.matchMedia(MOBILE_LAYOUT_MQ).matches;
}

/** True when running inside the Tauri desktop shell (or VITE_DESKTOP=1). */
export function isDesktopApp() {
	if (isMobileApp()) return false;
	if (envFlag(import.meta.env.VITE_DESKTOP)) return true;
	return isTauriRuntime();
}

/** Default Remember me checkbox state (on for web and desktop). */
export function defaultRememberMe() {
	return true;
}

/** Map checkbox state to API remember flag (false only when explicitly unchecked). */
export function effectiveRememberMe(rememberChecked) {
	return rememberChecked !== false;
}
