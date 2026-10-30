export const SOURCE_KIND_LABELS = {
	cash: 'Cash',
	bank: 'Bank',
	ewallet: 'E-wallet'
};

export const EWALLET_PRESETS = ['GCash', 'Maya', 'GrabPay', 'ShopeePay', 'PayPal'];

export const BANK_PRESETS = [
	'BPI',
	'BDO',
	'Metrobank',
	'UnionBank',
	'Landbank',
	'Security Bank',
	'RCBC',
	'Chinabank',
	'PNB'
];

export function kindLabel(kind) {
	return SOURCE_KIND_LABELS[kind] || kind || 'Source';
}

export function activeSources(sources) {
	return (sources || []).filter((s) => s.status === 'active');
}

export function cashSource(sources) {
	const list = sources || [];
	return (
		list.find((s) => s.kind === 'cash' && s.status === 'active') ||
		list.find((s) => s.kind === 'cash') ||
		null
	);
}

export function cashSourceId(sources) {
	return cashSource(sources)?.id ?? null;
}

export function sourceSelectOptions(sources, keepId) {
	return (sources || []).filter((s) => s.status === 'active' || s.id === keepId);
}

export function unusedPresets(sources, presets) {
	const taken = new Set((sources || []).map((s) => String(s.name).toLowerCase()));
	return presets.filter((name) => !taken.has(name.toLowerCase()));
}

export function matchSourceByName(sources, name) {
	const key = String(name || '')
		.trim()
		.toLowerCase();
	if (!key) return null;
	const list = sources || [];
	return (
		list.find((s) => s.status === 'active' && String(s.name).toLowerCase() === key) ||
		list.find((s) => String(s.name).toLowerCase() === key) ||
		null
	);
}

export function resolveSourceId(rawName, sources, fallbackId) {
	const matched = matchSourceByName(sources, rawName);
	return matched?.id ?? fallbackId ?? null;
}
