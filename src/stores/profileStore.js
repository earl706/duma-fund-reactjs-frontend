import { create } from 'zustand';

import { del as apiDelete, get as apiGet, patch as apiPatch, post as apiPost } from '../lib/api';
import { readStoredProfileId, writeStoredProfileId } from '../lib/profileScope';

function pickActive(profiles, preferredId) {
	if (!profiles?.length) return null;
	if (preferredId != null) {
		const match = profiles.find((p) => p.id === preferredId);
		if (match) return match;
	}
	const owned = profiles.find((p) => p.is_owner);
	return owned || profiles[0];
}

export const useProfileStore = create((set, get) => ({
	profiles: [],
	pendingInvites: [],
	pendingInviteCount: 0,
	activeProfileId: readStoredProfileId(),
	role: null,
	status: 'idle',
	error: null,

	activeProfile() {
		const { profiles, activeProfileId } = get();
		return profiles.find((p) => p.id === activeProfileId) || null;
	},

	isOwner() {
		return get().role === 'owner';
	},

	canEditLedger() {
		const role = get().role;
		return role === 'owner' || role === 'editor';
	},

	async hydrate() {
		set({ status: 'loading', error: null });
		try {
			const data = await apiGet('/finance/profiles/');
			const profiles = data.results || [];
			const invites = await apiGet('/finance/invites/');
			const pendingInvites = invites.results || [];
			const chosen = pickActive(profiles, get().activeProfileId);
			writeStoredProfileId(chosen?.id ?? null);
			set({
				profiles,
				pendingInvites,
				pendingInviteCount: data.pending_invite_count ?? pendingInvites.length,
				activeProfileId: chosen?.id ?? null,
				role: chosen?.role ?? null,
				status: 'ready',
				error: null
			});
			return chosen;
		} catch (err) {
			set({ status: 'error', error: err });
			throw err;
		}
	},

	async refreshInvites() {
		const [profilesData, invites] = await Promise.all([
			apiGet('/finance/profiles/'),
			apiGet('/finance/invites/')
		]);
		const pendingInvites = invites.results || [];
		set({
			profiles: profilesData.results || get().profiles,
			pendingInvites,
			pendingInviteCount: profilesData.pending_invite_count ?? pendingInvites.length
		});
	},

	setActive(id) {
		const profile = get().profiles.find((p) => p.id === id);
		if (!profile) return;
		writeStoredProfileId(profile.id);
		set({ activeProfileId: profile.id, role: profile.role });
	},

	async createProfile(name, starting_balance = '0.00') {
		const created = await apiPost('/finance/profiles/', { name, starting_balance });
		await get().hydrate();
		get().setActive(created.id);
		return created;
	},

	async updateProfile(id, body) {
		const updated = await apiPatch(`/finance/profiles/${id}/`, body);
		await get().hydrate();
		return updated;
	},

	async deleteProfile(id) {
		await apiDelete(`/finance/profiles/${id}/`);
		writeStoredProfileId(null);
		set({ activeProfileId: null });
		await get().hydrate();
	},

	async inviteMember(profileId, email, role) {
		const invite = await apiPost(`/finance/profiles/${profileId}/members/`, { email, role });
		return invite;
	},

	async revokeInvite(profileId, inviteId) {
		await apiDelete(`/finance/profiles/${profileId}/invites/${inviteId}/`);
	},

	async changeMemberRole(profileId, userId, role) {
		return apiPatch(`/finance/profiles/${profileId}/members/${userId}/`, { role });
	},

	async removeMember(profileId, userId) {
		await apiDelete(`/finance/profiles/${profileId}/members/${userId}/`);
	},

	async leaveProfile(profileId, userId) {
		await apiDelete(`/finance/profiles/${profileId}/members/${userId}/`);
		if (get().activeProfileId === profileId) {
			writeStoredProfileId(null);
			set({ activeProfileId: null });
		}
		await get().hydrate();
	},

	async acceptInvite(inviteId) {
		const profile = await apiPost(`/finance/invites/${inviteId}/accept/`);
		await get().hydrate();
		get().setActive(profile.id);
		return profile;
	},

	async declineInvite(inviteId) {
		await apiPost(`/finance/invites/${inviteId}/decline/`);
		await get().refreshInvites();
	},

	reset() {
		writeStoredProfileId(null);
		set({
			profiles: [],
			pendingInvites: [],
			pendingInviteCount: 0,
			activeProfileId: null,
			role: null,
			status: 'idle',
			error: null
		});
	}
}));

export function useProfileRole() {
	return useProfileStore((s) => s.role);
}

export function useCanEditLedger() {
	return useProfileStore((s) => s.role === 'owner' || s.role === 'editor');
}

export function useIsProfileOwner() {
	return useProfileStore((s) => s.role === 'owner');
}

export function useActiveProfileId() {
	return useProfileStore((s) => s.activeProfileId);
}
