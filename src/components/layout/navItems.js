import { LayoutDashboard, List } from 'lucide-react';

/** Primary navigation, grouped for the sidebar. `end` marks exact-match links. */
export const navGroups = [
	{
		label: 'Workspace',
		items: [
			{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
			{ to: '/lists', label: 'Lists', icon: List }
		]
	}
];
