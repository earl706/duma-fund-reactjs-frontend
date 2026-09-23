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
