import { isMobileApp } from './desktop';

export const PROFILE_STORAGE_KEY = isMobileApp()
	? 'dumafund.mobile.activeProfileId'
	: 'dumafund.activeProfileId';

export function readStoredProfileId() {
	try {
		const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
		if (!raw) return null;
		const id = Number(raw);
		return Number.isFinite(id) ? id : null;
	} catch {
		return null;
	}
}

export function writeStoredProfileId(id) {
	try {
		if (id == null) localStorage.removeItem(PROFILE_STORAGE_KEY);
		else localStorage.setItem(PROFILE_STORAGE_KEY, String(id));
	} catch {
		/* ignore */
	}
}

export function isProfileScopedFinanceUrl(url = '') {
	const path = String(url);
	if (!path.includes('/finance/')) return false;
	if (path.includes('/finance/profiles')) return false;
	if (path.includes('/finance/invites')) return false;
	return true;
}
