import { cn } from '../../lib/format';

export const ICON_SRC = {
	default: `${import.meta.env.BASE_URL}app-icon.svg`,
	inverse: `${import.meta.env.BASE_URL}app-icon-inverse.svg`
};

/** App logo — vector trace of `public/app-icon-source.png`. */
export function AppIcon({ size = 36, variant = 'default', className, alt = 'DumaFund' }) {
	const src = ICON_SRC[variant] ?? ICON_SRC.default;
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
