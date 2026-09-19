import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { LoadingScreen } from '../ui';

/** Gate authenticated routes; show a loader while the session rehydrates. */
export function ProtectedRoute({ children }) {
	const status = useAuthStore((s) => s.status);
	const profileStatus = useProfileStore((s) => s.status);
	const hydrate = useProfileStore((s) => s.hydrate);
	const resetProfiles = useProfileStore((s) => s.reset);
	const location = useLocation();

	useEffect(() => {
		if (status === 'authenticated' && (profileStatus === 'idle' || profileStatus === 'error')) {
			hydrate().catch(() => {});
		}
		if (status === 'unauthenticated') {
			resetProfiles();
		}
	}, [status, profileStatus, hydrate, resetProfiles]);

	if (status === 'idle' || status === 'loading') {
		return <LoadingScreen label="Restoring your session…" />;
	}
	if (status === 'unauthenticated') {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}
	if (profileStatus === 'idle' || profileStatus === 'loading') {
		return <LoadingScreen label="Loading profiles…" />;
	}
	return children;
}
