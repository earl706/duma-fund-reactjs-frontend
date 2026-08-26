import { lazy } from 'react';

export const publicRoutes = [
	{
		path: '/login',
		Component: lazy(() => import('./Auth').then((m) => ({ default: m.LoginPage })))
	},
	{
		path: '/register',
		Component: lazy(() => import('./Auth').then((m) => ({ default: m.RegisterPage })))
	},
	{
		path: '/oauth/callback',
		Component: lazy(() => import('./OAuthCallback'))
	},
	{
		path: '/check-email',
		Component: lazy(() =>
			import('./EmailVerification').then((m) => ({ default: m.CheckEmailPage }))
		)
	},
	{
		path: '/verify-email',
		Component: lazy(() =>
			import('./EmailVerification').then((m) => ({ default: m.VerifyEmailPage }))
		)
	}
];

export const appRoutes = [
	{ path: '/', Component: lazy(() => import('./Dashboard')) },
	{ path: 'lists', Component: lazy(() => import('./CostLists')) },
	{ path: 'lists/:id', Component: lazy(() => import('./CostListDetail')) },
	{ path: 'settings', Component: lazy(() => import('./Settings')) }
];
