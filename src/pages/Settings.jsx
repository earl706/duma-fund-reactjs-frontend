import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { LogOut, Search, Settings as SettingsIcon, Shield, Trash2 } from 'lucide-react';

import { patch } from '../lib/api';
import { isMobileApp } from '../lib/desktop';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { ProfileSettingsCard } from '../components/finance/ProfileSettingsCard';
import { WalletSourcesCard } from '../components/finance/WalletSourcesCard';
import { InviteList } from '../components/layout/InviteInbox';
import { ProfileSwitcher } from '../components/finance/ProfileSwitcher';
import { LLM_PROVIDERS, useLlmStore } from '../stores/llmStore';
import { useThemeStore } from '../stores/themeStore';
import { useUIStore } from '../stores/uiStore';
import { MfaDisableSection, MfaSetupModal } from '../components/auth/MfaModals';
import { PageHeader } from '../components/layout/PageHeader';
import { PurchaseAlertList } from '../components/layout/PurchaseNotifications';
import { Avatar, Button, Card, CardBody, CardHeader, Input, Modal } from '../components/ui';

function accountDisplayName(user) {
	const name = (user?.full_name || '').trim();
	return name || user?.email || '';
}

function deleteChallengePhrase(user) {
	return `Delete ${accountDisplayName(user)}`;
}

function blockChallengeClipboard(event) {
	event.preventDefault();
}

const PROVIDER_LABELS = {
	openai: 'OpenAI',
	gemini: 'Gemini'
};

const SETTINGS_TABS = [
	{ id: 'shortcuts', label: 'Shortcuts', mobileOnly: true },
	{ id: 'account', label: 'Account' },
	{ id: 'profiles', label: 'Profiles' },
	{ id: 'wallet', label: 'Wallet' },
	{ id: 'security', label: 'Security' },
	{ id: 'receipt-ai', label: 'Receipt AI' }
];

function visibleSettingTabs(mobile) {
	return SETTINGS_TABS.filter((tab) => !tab.mobileOnly || mobile);
}

function resolveSettingTab(raw, mobile) {
	const allowed = visibleSettingTabs(mobile);
	if (allowed.some((tab) => tab.id === raw)) return raw;
	return mobile ? 'shortcuts' : 'account';
}

function SettingsTabBar({ tabs, active, onChange }) {
	return (
		<div className="overflow-x-auto">
			<div
				className="border-line bg-surface-2 inline-flex rounded-md border p-0.5"
				role="tablist"
				aria-label="Settings sections"
			>
				{tabs.map((tab) => {
					const selected = active === tab.id;
					return (
						<Button
							key={tab.id}
							type="button"
							size="sm"
							variant={selected ? 'primary' : 'ghost'}
							className="h-8 shrink-0 whitespace-nowrap"
							role="tab"
							id={`settings-tab-${tab.id}`}
							aria-selected={selected}
							aria-controls={`settings-panel-${tab.id}`}
							onClick={() => onChange(tab.id)}
						>
							{tab.label}
						</Button>
					);
				})}
			</div>
		</div>
	);
}

function SettingsPanel({ id, active, children }) {
	const selected = active === id;
	return (
		<div
			role="tabpanel"
			id={`settings-panel-${id}`}
			aria-labelledby={`settings-tab-${id}`}
			hidden={!selected}
		>
			{/* Unmount inactive panels so password fields (Receipt AI) are not in the DOM
			    and Chrome does not treat Wallet edits as a login form. */}
			{selected ? children : null}
		</div>
	);
}

export default function SettingsPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const updateUser = useAuthStore((s) => s.updateUser);
	const { theme, setTheme } = useThemeStore();
	const openPalette = useUIStore((s) => s.openPalette);
	const mobile = isMobileApp();
	const {
		provider,
		openaiApiKey,
		openaiModel,
		geminiApiKey,
		geminiModel,
		setProvider,
		setOpenAI,
		setGemini,
		clearKeys
	} = useLlmStore();
	const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState('');
	const [newEmail, setNewEmail] = useState('');
	const [openaiKeyDraft, setOpenaiKeyDraft] = useState(null);
	const [openaiModelDraft, setOpenaiModelDraft] = useState(null);
	const [geminiKeyDraft, setGeminiKeyDraft] = useState(null);
	const [geminiModelDraft, setGeminiModelDraft] = useState(null);

	const saveName = useMutation({
		mutationFn: (body) => patch('/auth/me/', body),
		onSuccess: (data) => {
			updateUser(data);
			toast.success('Profile updated.');
		},
		onError: () => toast.error('Could not update profile.')
	});

	const changeEmail = useMutation({
		mutationFn: (email) => useAuthStore.getState().changeEmail(email),
		onSuccess: (data) => {
			toast.success(data.detail || 'Confirmation sent to your new email.');
			setNewEmail('');
		},
		onError: (err) => {
			toast.error(err.response?.data?.detail || 'Could not change email.');
		}
	});

	const deleteAccount = useMutation({
		mutationFn: () => useAuthStore.getState().deleteAccount(),
		onSuccess: () => {
			toast.success('Your account has been deleted.');
			navigate('/login', { replace: true });
		},
		onError: (err) => {
			toast.error(err.response?.data?.detail || 'Could not delete account.');
		}
	});

	if (!user) return null;

	const challengePhrase = deleteChallengePhrase(user);
	const deleteReady = deleteConfirm === challengePhrase;

	const closeDeleteModal = () => {
		setDeleteOpen(false);
		setDeleteConfirm('');
	};

	const tabs = visibleSettingTabs(mobile);
	const activeTab = resolveSettingTab(searchParams.get('tab'), mobile);
	const setActiveTab = (id) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.set('tab', id);
				return next;
			},
			{ replace: true }
		);
	};

	return (
		<div>
			<div
				className={
					'bg-bg/95 sticky top-0 z-20 -mx-4 space-y-3 px-4 pb-3 ' +
					'supports-[backdrop-filter]:bg-bg/80 backdrop-blur' +
					'sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8' +
					(mobile ? 'pt-[max(0px,env(safe-area-inset-top))]' : '')
				}
			>
				<PageHeader
					title="Settings"
					icon={SettingsIcon}
					description="Manage your account and preferences."
					className="mb-0 pt-4 sm:pt-6 lg:pt-8"
				/>
				<SettingsTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
			</div>

			<div className="mx-auto max-w-7xl pt-4">
				{mobile && (
					<SettingsPanel id="shortcuts" active={activeTab}>
						<Card>
							<CardHeader
								title="Shortcuts"
								subtitle="Search and alerts used to live in the top bar"
							/>
							<CardBody className="space-y-4">
								<ProfileSwitcher />
								<Button variant="secondary" className="w-full" onClick={openPalette}>
									<Search size={16} /> Search transactions
								</Button>
								<InviteList />
								<PurchaseAlertList />
							</CardBody>
						</Card>
					</SettingsPanel>
				)}
				<SettingsPanel id="account" active={activeTab}>
					<Card>
						<CardHeader title="Account" />
						<CardBody className="space-y-4">
							<div className="flex items-center gap-3">
								<Avatar name={user?.full_name || user?.email} src={user?.avatar_url} size={48} />
								<div>
									<p className="text-fg font-medium">{user?.full_name || 'Unnamed'}</p>
									<p className="text-muted text-sm">{user?.email}</p>
								</div>
							</div>
							<Input
								label="Full name"
								defaultValue={user?.full_name}
								onBlur={(e) =>
									e.target.value !== user?.full_name &&
									saveName.mutate({ full_name: e.target.value })
								}
							/>
							<div className="space-y-2">
								<Input
									label="Email"
									type="email"
									value={newEmail}
									onChange={(e) => setNewEmail(e.target.value)}
									placeholder={user?.email}
								/>
								<Button
									type="button"
									variant="secondary"
									className="w-full"
									loading={changeEmail.isPending}
									disabled={!newEmail || newEmail.toLowerCase() === user?.email?.toLowerCase()}
									onClick={() => changeEmail.mutate(newEmail)}
								>
									Change email
								</Button>
								<p className="text-muted text-xs">
									We will send a confirmation link to the new address before it becomes active.
								</p>
							</div>
							<div>
								<span className="text-fg mb-1.5 block text-sm font-medium">Theme</span>
								<div className="flex gap-2">
									{['light', 'dark'].map((t) => (
										<button
											key={t}
											onClick={() => setTheme(t)}
											className={`flex-1 cursor-pointer rounded-md border px-4 py-2 text-sm capitalize ${
												theme === t ? 'border-primary text-primary' : 'border-line text-muted'
											}`}
										>
											{t}
										</button>
									))}
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Button variant="danger" onClick={logout} className="h-11 w-full sm:h-9">
									<LogOut size={16} /> Sign out
								</Button>
								<div className="border-danger/30 bg-danger/5 space-y-3 rounded-md border p-3 sm:p-4">
									<div>
										<p className="text-fg text-sm font-semibold">Delete account</p>
										<p className="text-muted mt-1 text-xs leading-relaxed sm:text-sm">
											Permanently removes your account, owned ledgers, and personal data. Ledgers
											owned by others stay; your access to them is removed. This cannot be undone.
										</p>
									</div>
									<Button
										variant="danger"
										className="h-11 w-full sm:h-9"
										onClick={() => {
											setDeleteConfirm('');
											setDeleteOpen(true);
										}}
									>
										<Trash2 size={16} /> Delete account
									</Button>
								</div>
							</div>
						</CardBody>
					</Card>
				</SettingsPanel>

				<SettingsPanel id="profiles" active={activeTab}>
					<ProfileSettingsCard />
				</SettingsPanel>
				<SettingsPanel id="wallet" active={activeTab}>
					<WalletSourcesCard />
				</SettingsPanel>

				<SettingsPanel id="security" active={activeTab}>
					<Card>
						<CardHeader
							title="Two-factor authentication"
							subtitle="Protect your account with an authenticator app"
						/>
						<CardBody className="space-y-4">
							{user?.mfa_enabled ? (
								<MfaDisableSection />
							) : (
								<Button onClick={() => setMfaSetupOpen(true)}>
									<Shield size={16} /> Enable MFA
								</Button>
							)}
						</CardBody>
					</Card>
				</SettingsPanel>

				<SettingsPanel id="receipt-ai" active={activeTab}>
					<Card>
						<CardHeader title="Receipt AI" subtitle="Used for receipt scan when a key is saved" />
						<CardBody className="space-y-4">
							<div>
								<span className="text-fg mb-1.5 block text-sm font-medium">Provider</span>
								<div className="flex gap-2">
									{LLM_PROVIDERS.map((p) => (
										<button
											key={p}
											type="button"
											onClick={() => setProvider(p)}
											className={`flex-1 cursor-pointer rounded-md border px-4 py-2 text-sm ${
												provider === p ? 'border-primary text-primary' : 'border-line text-muted'
											}`}
										>
											{PROVIDER_LABELS[p]}
										</button>
									))}
								</div>
							</div>

							{provider === 'openai' ? (
								<>
									<Input
										label="OpenAI API key"
										type="password"
										autoComplete="new-password"
										name="openai-api-key"
										value={openaiKeyDraft != null ? openaiKeyDraft : openaiApiKey}
										onChange={(e) => setOpenaiKeyDraft(e.target.value)}
										onBlur={() => {
											if (openaiKeyDraft == null) return;
											if (openaiKeyDraft === openaiApiKey) {
												setOpenaiKeyDraft(null);
												return;
											}
											setOpenAI({ apiKey: openaiKeyDraft });
											setOpenaiKeyDraft(null);
										}}
										placeholder="sk-…"
									/>
									<Input
										label="OpenAI model"
										value={openaiModelDraft != null ? openaiModelDraft : openaiModel}
										onChange={(e) => setOpenaiModelDraft(e.target.value)}
										onBlur={() => {
											if (openaiModelDraft == null) return;
											if (openaiModelDraft.trim() === openaiModel) {
												setOpenaiModelDraft(null);
												return;
											}
											setOpenAI({ model: openaiModelDraft });
											setOpenaiModelDraft(null);
										}}
										placeholder="gpt-4o-mini"
									/>
								</>
							) : (
								<>
									<Input
										label="Gemini API key"
										type="password"
										autoComplete="new-password"
										name="gemini-api-key"
										value={geminiKeyDraft != null ? geminiKeyDraft : geminiApiKey}
										onChange={(e) => setGeminiKeyDraft(e.target.value)}
										onBlur={() => {
											if (geminiKeyDraft == null) return;
											if (geminiKeyDraft === geminiApiKey) {
												setGeminiKeyDraft(null);
												return;
											}
											setGemini({ apiKey: geminiKeyDraft });
											setGeminiKeyDraft(null);
										}}
										placeholder="AIza…"
									/>
									<Input
										label="Gemini model"
										value={geminiModelDraft != null ? geminiModelDraft : geminiModel}
										onChange={(e) => setGeminiModelDraft(e.target.value)}
										onBlur={() => {
											if (geminiModelDraft == null) return;
											if (geminiModelDraft.trim() === geminiModel) {
												setGeminiModelDraft(null);
												return;
											}
											setGemini({ model: geminiModelDraft });
											setGeminiModelDraft(null);
										}}
										placeholder="gemini-3.5-flash"
									/>
								</>
							)}

							<Button
								type="button"
								variant="secondary"
								className="w-full"
								disabled={!openaiApiKey && !geminiApiKey}
								onClick={() => {
									clearKeys();
									setOpenaiKeyDraft(null);
									setGeminiKeyDraft(null);
									toast.success('Saved API keys cleared.');
								}}
							>
								Clear saved keys
							</Button>
						</CardBody>
					</Card>
				</SettingsPanel>
			</div>
			<MfaSetupModal open={mfaSetupOpen} onClose={() => setMfaSetupOpen(false)} />
			<Modal
				open={deleteOpen}
				onClose={closeDeleteModal}
				title="Delete account"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={closeDeleteModal}
							disabled={deleteAccount.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							loading={deleteAccount.isPending}
							disabled={!deleteReady}
							onClick={() => deleteAccount.mutate()}
						>
							Delete permanently
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<p className="text-muted text-sm leading-relaxed">
						This permanently deletes your account and all ledgers you own. Type the phrase below to
						confirm.
					</p>
					<p
						className="border-line bg-surface-2 text-fg rounded-md border px-3 py-2.5 text-center font-mono text-sm break-all select-none"
						aria-label={`Type ${challengePhrase} to confirm`}
						onCopy={blockChallengeClipboard}
						onCut={blockChallengeClipboard}
						onContextMenu={blockChallengeClipboard}
						onDragStart={blockChallengeClipboard}
					>
						{challengePhrase}
					</p>
					<Input
						label="Confirmation"
						value={deleteConfirm}
						onChange={(e) => setDeleteConfirm(e.target.value)}
						placeholder="Type the phrase above"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
					/>
				</div>
			</Modal>
		</div>
	);
}
