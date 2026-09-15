import {
	ArrowLeftRight,
	FolderTree,
	LayoutDashboard,
	RefreshCw,
	ScanLine,
	User
} from 'lucide-react';

/** Primary navigation, grouped for the sidebar. `end` marks exact-match links. */
export const navGroups = [
	{
		label: 'Workspace',
		items: [
			{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
			{ to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
			{ to: '/regular-buys', label: 'Regular buys', icon: RefreshCw },
			{ to: '/categories', label: 'Categories', icon: FolderTree }
		]
	}
];

/** iOS shell bottom tabs. `scan` opens the receipt modal instead of a route. */
export const mobileTabs = [
	{ to: '/', label: 'Home', icon: LayoutDashboard, end: true },
	{ to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
	{ kind: 'scan', label: 'Scan', icon: ScanLine },
	{ to: '/categories', label: 'Categories', icon: FolderTree },
	{ to: '/settings', label: 'Profile', icon: User }
];
