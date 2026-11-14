import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
	Calculator,
	Check,
	LogOut,
	Search,
	Settings as SettingsIcon,
	Shield,
	Trash2
} from 'lucide-react';

import { patch } from '../lib/api';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useCalculatorStore } from '../stores/calculatorStore';
import { ProfileSettingsCard } from '../components/finance/ProfileSettingsCard';
import { WalletSourcesCard } from '../components/finance/WalletSourcesCard';
import { InviteList } from '../components/layout/InviteInbox';
import { ProfileSwitcher } from '../components/finance/ProfileSwitcher';
import { LLM_PROVIDERS, useLlmStore } from '../stores/llmStore';
import { useThemeStore } from '../stores/themeStore';
import { useUIStore } from '../stores/uiStore';
import { MfaDisableSection, MfaSetupModal } from '../components/auth/MfaModals';
import { PageHeader } from '../components/layout/PageHeader';
import { StickyPageChrome } from '../components/layout/StickyPageChrome';
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
	gemini: 'Gemini',
	groq: 'Groq',
	openrouter: 'OpenRouter'
};

const PROVIDER_FORMS = {
	openai: {
		keyLabel: 'OpenAI API key',
		keyName: 'openai-api-key',
		keyPlaceholder: 'sk-…',
		modelLabel: 'OpenAI model',
		modelPlaceholder: 'gpt-4o-mini',
		modelState: 'openaiModel',
		keySet: 'openaiKeySet',
		keyHint: 'openaiKeyHint',
		setter: 'setOpenAI',
		success: 'OpenAI key saved to your account.',
		modelError: 'Could not save OpenAI model.',
		keyError: 'Could not save OpenAI key.'
	},
	gemini: {
		keyLabel: 'Gemini API key',
		keyName: 'gemini-api-key',
		keyPlaceholder: 'AIza…',
		modelLabel: 'Gemini model',
		modelPlaceholder: 'gemini-3.5-flash',
		modelState: 'geminiModel',
		keySet: 'geminiKeySet',
		keyHint: 'geminiKeyHint',
		setter: 'setGemini',
		success: 'Gemini key saved to your account.',
		modelError: 'Could not save Gemini model.',
		keyError: 'Could not save Gemini key.'
	},
	groq: {
		keyLabel: 'Groq API key',
		keyName: 'groq-api-key',
		keyPlaceholder: 'gsk_…',
		modelLabel: 'Groq model',
		modelPlaceholder: 'qwen/qwen3.8-27b',
		modelState: 'groqModel',
		keySet: 'groqKeySet',
		keyHint: 'groqKeyHint',
		setter: 'setGroq',
		success: 'Groq key saved to your account.',
		modelError: 'Could not save Groq model.',
		keyError: 'Could not save Groq key.'
	},
	openrouter: {
		keyLabel: 'OpenRouter API key',
		keyName: 'openrouter-api-key',
		keyPlaceholder: 'sk-or-…',
		modelLabel: 'OpenRouter model',
		modelPlaceholder: 'nvidia/nemotron-3.5-super-vl:free',
		modelState: 'openrouterModel',
		keySet: 'openrouterKeySet',
		keyHint: 'openrouterKeyHint',
		setter: 'setOpenRouter',
		success: 'OpenRouter key saved to your account.',
		modelError: 'Could not save OpenRouter model.',
		keyError: 'Could not save OpenRouter key.'
	}
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

function SettingsTabBar({ tabs, active, onChange, wrap = false }) {
	return (
		<div className={wrap ? undefined : 'overflow-x-auto'}>
			<div
				className={
					'border-line bg-surface-2 rounded-md border p-0.5 ' +
					(wrap ? 'flex flex-wrap gap-0.5' : 'inline-flex')
				}
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
	const openCalculator = useCalculatorStore((s) => s.openCalculator);
	const mobile = useMobileLayout();
	const llm = useLlmStore();
	const {
		provider,
		openaiKeySet,
		geminiKeySet,
		groqKeySet,
		openrouterKeySet,
		setProvider,
		clearKeys
	} = llm;
	const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState('');
	const [newEmail, setNewEmail] = useState('');
	const [keyDraft, setKeyDraft] = useState(null);
	const [modelDraft, setModelDraft] = useState(null);

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
			<StickyPageChrome>
				<PageHeader
					title="Settings"
					icon={SettingsIcon}
					description="Manage your account and preferences."
					className="mb-0"
				/>
				<SettingsTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} wrap={mobile} />
			</StickyPageChrome>

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
								<Button variant="secondary" className="w-full" onClick={() => openCalculator()}>
									<Calculator size={16} /> Calculator
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
						<CardHeader
							title="Receipt AI"
							subtitle="Saved on your account — available on desktop, mobile, and browser"
							action={
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="shrink-0"
									disabled={!openaiKeySet && !geminiKeySet && !groqKeySet && !openrouterKeySet}
									onClick={async () => {
										try {
											await clearKeys();
											setKeyDraft(null);
											setModelDraft(null);
											toast.success('All saved API keys cleared.');
										} catch {
											toast.error('Could not clear keys.');
										}
									}}
								>
									Clear all keys
								</Button>
							}
						/>
						<CardBody className="space-y-4">
							<div>
								<span className="text-fg mb-1.5 block text-sm font-medium">Provider</span>
								<div className="flex flex-wrap gap-2">
									{LLM_PROVIDERS.map((p) => {
										const form = PROVIDER_FORMS[p];
										const keySaved = Boolean(llm[form.keySet]);
										const selected = provider === p;
										return (
											<button
												key={p}
												type="button"
												onClick={() => {
													setKeyDraft(null);
													setModelDraft(null);
													setProvider(p);
												}}
												aria-label={
													keySaved ? `${PROVIDER_LABELS[p]}, API key saved` : PROVIDER_LABELS[p]
												}
												className={`flex min-w-[calc(50%-0.25rem)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm sm:min-w-0 ${
													selected ? 'border-primary text-primary' : 'border-line text-muted'
												}`}
											>
												{PROVIDER_LABELS[p]}
												{keySaved ? (
													<span
														className="bg-success/15 text-success inline-flex size-4 shrink-0 items-center justify-center rounded-sm"
														title="API key saved"
														aria-hidden="true"
													>
														<Check size={11} strokeWidth={2.75} className="block" />
													</span>
												) : null}
											</button>
										);
									})}
								</div>
							</div>

							{(() => {
								const form = PROVIDER_FORMS[provider] || PROVIDER_FORMS.openai;
								const savedModel = llm[form.modelState];
								const keySet = llm[form.keySet];
								const keyHint = llm[form.keyHint];
								const save = llm[form.setter];
								const label = PROVIDER_LABELS[provider] || 'provider';
								return (
									<>
										<Input
											label={form.keyLabel}
											type="password"
											autoComplete="new-password"
											name={form.keyName}
											value={keyDraft != null ? keyDraft : ''}
											onChange={(e) => setKeyDraft(e.target.value)}
											onBlur={async () => {
												if (keyDraft == null) return;
												const next = keyDraft.trim();
												setKeyDraft(null);
												if (!next) return;
												try {
													await save({ apiKey: next });
													toast.success(form.success);
												} catch {
													toast.error(form.keyError);
												}
											}}
											placeholder={keySet && keyHint ? `••••${keyHint}` : form.keyPlaceholder}
										/>
										<Input
											label={form.modelLabel}
											value={modelDraft != null ? modelDraft : savedModel}
											onChange={(e) => setModelDraft(e.target.value)}
											onBlur={async () => {
												if (modelDraft == null) return;
												if (modelDraft.trim() === savedModel) {
													setModelDraft(null);
													return;
												}
												try {
													await save({ model: modelDraft });
													setModelDraft(null);
												} catch {
													toast.error(form.modelError);
												}
											}}
											placeholder={form.modelPlaceholder}
										/>
										<Button
											type="button"
											variant="secondary"
											className="w-full"
											disabled={!keySet}
											onClick={async () => {
												try {
													await clearKeys(provider);
													setKeyDraft(null);
													setModelDraft(null);
													toast.success(`${label} API key cleared.`);
												} catch {
													toast.error(`Could not clear ${label} key.`);
												}
											}}
										>
											Clear {label} key
										</Button>
									</>
								);
							})()}
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
