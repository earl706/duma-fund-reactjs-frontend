import { ArrowLeftRight, FolderTree, LayoutDashboard } from 'lucide-react';

/** Primary navigation, grouped for the sidebar. `end` marks exact-match links. */
export const navGroups = [
	{
		label: 'Workspace',
		items: [
			{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
			{ to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
			{ to: '/categories', label: 'Categories', icon: FolderTree }
		]
	}
];
