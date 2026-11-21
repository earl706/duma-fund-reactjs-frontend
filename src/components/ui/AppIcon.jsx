import { cn } from '../../lib/format';
import { useThemeStore } from '../../stores/themeStore';

const BASE = import.meta.env.BASE_URL;

export const ICON_SRC = {
	light: `${BASE}light-icon.png`,
	dark: `${BASE}dark-icon.png`,
	/** @deprecated use light */
	default: `${BASE}light-icon.png`,
	/** @deprecated use dark */
	inverse: `${BASE}dark-icon.png`
};

/** App logo — theme-aware PNGs (`light-icon.png` / `dark-icon.png`). */
export function AppIcon({ size = 36, variant, className, alt = 'DumaFund' }) {
	const theme = useThemeStore((s) => s.theme);
	const resolved =
		variant === 'light' || variant === 'default'
			? 'light'
			: variant === 'dark' || variant === 'inverse'
				? 'dark'
				: theme === 'dark'
					? 'dark'
					: 'light';
	const src = ICON_SRC[resolved];
	return (
		<img
			src={src}
			alt={alt}
			width={size}
			height={size}
			className={cn('rounded-sm object-cover', className)}
			draggable={false}
		/>
	);
}
