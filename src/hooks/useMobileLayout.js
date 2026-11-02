import { useSyncExternalStore } from 'react';

import { isMobileApp, MOBILE_LAYOUT_MQ } from '../lib/desktop';

function subscribe(onStoreChange) {
	const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
	mq.addEventListener('change', onStoreChange);
	return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
	if (isMobileApp()) return true;
	return window.matchMedia(MOBILE_LAYOUT_MQ).matches;
}

function getServerSnapshot() {
	return isMobileApp();
}

/** True for the iOS build, or any browser viewport below Tailwind `lg`. */
export function useMobileLayout() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
