import { useState } from 'react';
import { Laptop } from 'lucide-react';

import { DEFAULT_API_PORT, suggestedMobileOrigin } from '../lib/apiOrigin';
import { useApiOriginStore } from '../stores/apiOriginStore';
import { AuthShell } from './Auth';
import { Button, Input } from '../components/ui';

export default function ConnectServerPage() {
	const origin = useApiOriginStore((s) => s.origin);
	const error = useApiOriginStore((s) => s.error);
	const probing = useApiOriginStore((s) => s.probing);
	const connect = useApiOriginStore((s) => s.connect);
	const hint = origin || suggestedMobileOrigin();
	const [host, setHost] = useState(() => {
		if (!hint) return '';
		try {
			const url = new URL(hint.includes('://') ? hint : `http://${hint}`);
			return url.port && url.port !== String(DEFAULT_API_PORT)
				? `${url.hostname}:${url.port}`
				: url.hostname;
		} catch {
			return hint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
		}
	});
	const [port, setPort] = useState(String(DEFAULT_API_PORT));

	const submit = async (e) => {
		e.preventDefault();
		try {
			await connect(host, Number(port) || DEFAULT_API_PORT);
		} catch {
			/* error is in the store */
		}
	};

	return (
		<AuthShell>
			<div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-sm">
				<Laptop size={24} />
			</div>
			<h2 className="text-fg mt-4 text-2xl font-bold">Connect to your Mac</h2>
			<p className="text-muted mt-2 text-sm">
				Open DumaFund on your Mac and stay on the same Wi-Fi. Copy the Mac address from Settings →
				iPhone, then sign in with a phone account (separate from the Mac user).
			</p>
			<form onSubmit={submit} className="mt-6 space-y-4">
				<Input
					label="Mac IP or hostname"
					value={host}
					onChange={(e) => setHost(e.target.value)}
					placeholder="192.168.1.20"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					required
				/>
				<Input
					label="Port"
					type="number"
					min={1}
					max={65535}
					value={port}
					onChange={(e) => setPort(e.target.value)}
				/>
				{error && <p className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">{error}</p>}
				<Button type="submit" className="w-full" loading={probing}>
					Connect
				</Button>
			</form>
		</AuthShell>
	);
}
