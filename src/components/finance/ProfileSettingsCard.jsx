import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { get } from '../../lib/api';
import { formatCost } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { useIsProfileOwner, useProfileStore } from '../../stores/profileStore';
import { toast } from '../../stores/toastStore';
import { Button, Card, CardBody, CardHeader, Input, Modal, Select } from '../ui';
import { ProfileSwitcher } from './ProfileSwitcher';

export function ProfileSettingsCard() {
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const isOwner = useIsProfileOwner();
	const activeProfileId = useProfileStore((s) => s.activeProfileId);
	const active = useProfileStore((s) => s.activeProfile());
	const role = useProfileStore((s) => s.role);
	const createProfile = useProfileStore((s) => s.createProfile);
	const updateProfile = useProfileStore((s) => s.updateProfile);
	const deleteProfile = useProfileStore((s) => s.deleteProfile);
	const inviteMember = useProfileStore((s) => s.inviteMember);
	const revokeInvite = useProfileStore((s) => s.revokeInvite);
	const changeMemberRole = useProfileStore((s) => s.changeMemberRole);
	const removeMember = useProfileStore((s) => s.removeMember);
	const leaveProfile = useProfileStore((s) => s.leaveProfile);

	const [newName, setNewName] = useState('');
	const [renameDraft, setRenameDraft] = useState(null);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState('viewer');
	const [busy, setBusy] = useState(null);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { data: membersData, refetch: refetchMembers } = useQuery({
		queryKey: ['finance-profile-members', activeProfileId],
		queryFn: () => get(`/finance/profiles/${activeProfileId}/members/`),
		enabled: activeProfileId != null
	});

	const members = membersData?.results || [];
	const pending = membersData?.pending_invites || [];
	const profileName = renameDraft != null ? renameDraft : active?.name || '';

	const invalidateAll = () => {
		queryClient.invalidateQueries();
	};

	return (
		<Card>
			<CardHeader
				title="Profiles"
				subtitle="Separate ledgers for personal, family, or business. Share with existing DumaFund users."
			/>
			<CardBody className="space-y-4">
				<ProfileSwitcher />

				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<Input
						label="New profile"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. Family"
						className="flex-1"
					/>
					<Button
						loading={busy === 'create'}
						onClick={async () => {
							const name = newName.trim();
							if (!name) {
								toast.error('Name is required.');
								return;
							}
							setBusy('create');
							try {
								await createProfile(name);
								invalidateAll();
								setNewName('');
								toast.success('Profile created.');
							} catch {
								toast.error('Could not create profile.');
							} finally {
								setBusy(null);
							}
						}}
					>
						Create
					</Button>
				</div>

				{isOwner ? (
					<Input
						key={activeProfileId}
						label="Profile name"
						value={profileName}
						onChange={(e) => setRenameDraft(e.target.value)}
						onBlur={async () => {
							if (renameDraft == null) return;
							if (renameDraft.trim() === active?.name) {
								setRenameDraft(null);
								return;
							}
							try {
								await updateProfile(activeProfileId, { name: renameDraft.trim() });
								toast.success('Profile renamed.');
							} catch {
								toast.error('Could not rename profile.');
							} finally {
								setRenameDraft(null);
							}
						}}
					/>
				) : (
					<p className="text-muted text-sm">
						Shared profile · your role is <span className="capitalize">{role}</span>
						{active?.owner?.email ? ` · owner ${active.owner.full_name || active.owner.email}` : ''}
					</p>
				)}

				<p className="text-muted text-xs">
					Current ledger starting balance is managed in Wallet
					{active ? ` (${formatCost(active.starting_balance)})` : ''}.
				</p>

				{isOwner && (
					<div className="space-y-3">
						<p className="text-fg text-sm font-medium">Members</p>
						<ul className="space-y-2">
							{members.map((m) => (
								<li
									key={m.user.id}
									className="border-line flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
								>
									<div className="min-w-0">
										<p className="text-fg truncate">{m.user.full_name || m.user.email}</p>
										<p className="text-muted truncate text-xs">{m.user.email}</p>
									</div>
									{m.role === 'owner' ? (
										<span className="text-muted text-xs capitalize">{m.role}</span>
									) : (
										<div className="flex items-center gap-2">
											<Select
												value={m.role}
												onChange={async (e) => {
													try {
														await changeMemberRole(activeProfileId, m.user.id, e.target.value);
														refetchMembers();
														toast.success('Role updated.');
													} catch {
														toast.error('Could not change role.');
													}
												}}
												className="w-28"
											>
												<option value="editor">Editor</option>
												<option value="viewer">Viewer</option>
											</Select>
											<Button
												size="sm"
												variant="ghost"
												onClick={async () => {
													try {
														await removeMember(activeProfileId, m.user.id);
														refetchMembers();
														toast.success('Member removed.');
													} catch {
														toast.error('Could not remove member.');
													}
												}}
											>
												Remove
											</Button>
										</div>
									)}
								</li>
							))}
						</ul>
						{pending.map((inv) => (
							<div
								key={inv.id}
								className="border-line flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
							>
								<p className="text-muted min-w-0 truncate">
									Pending: {inv.invited_user?.email} as {inv.role}
								</p>
								<Button
									size="sm"
									variant="ghost"
									onClick={async () => {
										try {
											await revokeInvite(activeProfileId, inv.id);
											refetchMembers();
											toast.success('Invite revoked.');
										} catch {
											toast.error('Could not revoke invite.');
										}
									}}
								>
									Revoke
								</Button>
							</div>
						))}
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
							<Input
								label="Invite by email"
								type="email"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								placeholder="friend@email.com"
								className="flex-1"
							/>
							<Select
								label="Role"
								value={inviteRole}
								onChange={(e) => setInviteRole(e.target.value)}
								className="sm:w-32"
							>
								<option value="viewer">Viewer</option>
								<option value="editor">Editor</option>
							</Select>
							<Button
								loading={busy === 'invite'}
								onClick={async () => {
									if (!inviteEmail.trim()) {
										toast.error('Email is required.');
										return;
									}
									setBusy('invite');
									try {
										await inviteMember(activeProfileId, inviteEmail.trim(), inviteRole);
										setInviteEmail('');
										refetchMembers();
										toast.success('Invite sent. They must accept in-app.');
									} catch (err) {
										const detail =
											err?.response?.data?.email ||
											err?.response?.data?.detail ||
											'Could not send invite.';
										toast.error(typeof detail === 'string' ? detail : detail[0]);
									} finally {
										setBusy(null);
									}
								}}
							>
								Invite
							</Button>
						</div>
						<Button variant="danger" className="w-full" onClick={() => setDeleteOpen(true)}>
							Delete this profile
						</Button>
					</div>
				)}

				{!isOwner && user && (
					<Button
						variant="secondary"
						className="w-full"
						loading={busy === 'leave'}
						onClick={async () => {
							setBusy('leave');
							try {
								await leaveProfile(activeProfileId, user.id);
								invalidateAll();
								toast.success('Left profile.');
							} catch (err) {
								toast.error(err?.response?.data?.detail || 'Could not leave profile.');
							} finally {
								setBusy(null);
							}
						}}
					>
						Leave this profile
					</Button>
				)}
			</CardBody>
			<Modal
				open={deleteOpen}
				onClose={() => busy !== 'delete' && setDeleteOpen(false)}
				title="Delete profile"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setDeleteOpen(false)}
							disabled={busy === 'delete'}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							loading={busy === 'delete'}
							onClick={async () => {
								setBusy('delete');
								try {
									await deleteProfile(activeProfileId);
									invalidateAll();
									setDeleteOpen(false);
									toast.success('Profile deleted.');
								} catch (err) {
									toast.error(err?.response?.data?.detail || 'Could not delete profile.');
								} finally {
									setBusy(null);
								}
							}}
						>
							Delete
						</Button>
					</>
				}
			>
				<p className="text-muted text-sm">
					Delete <span className="text-fg font-medium">{active?.name || 'this profile'}</span>? Its
					transactions, categories, and members will be removed. This cannot be undone.
				</p>
			</Modal>
		</Card>
	);
}
