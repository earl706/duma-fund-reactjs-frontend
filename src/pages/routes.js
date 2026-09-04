import { createElement, lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';

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

function ListsRedirect() {
	return createElement(Navigate, { to: '/transactions', replace: true });
}

function ListDetailRedirect() {
	const { id } = useParams();
	return createElement(Navigate, { to: `/transactions/${id}`, replace: true });
}

export const appRoutes = [
	{ path: '/', Component: lazy(() => import('./Dashboard')) },
	{ path: 'transactions', Component: lazy(() => import('./Transactions')) },
	{ path: 'transactions/:id', Component: lazy(() => import('./TransactionDetail')) },
	{ path: 'categories', Component: lazy(() => import('./Categories')) },
	{ path: 'settings', Component: lazy(() => import('./Settings')) },
	{ path: 'lists', Component: ListsRedirect },
	{ path: 'lists/:id', Component: ListDetailRedirect }
];
