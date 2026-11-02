import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/format';

/**
 * Sticky blurred title chrome that bleeds to the main padding edges.
 * Top padding (incl. safe-area) applies only while stuck after scroll.
 */
export function StickyPageChrome({ children, className }) {
	const sentinelRef = useRef(null);
	const [stuck, setStuck] = useState(false);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return undefined;

		const root = document.getElementById('main-content');
		const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
			root: root || null,
			threshold: 0
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	return (
		<>
			<div ref={sentinelRef} className="pointer-events-none h-0 w-full" aria-hidden />
			<div
				className={cn(
					'bg-bg/95 sticky top-0 z-20 -mx-4 space-y-3 px-4 pb-3',
					'supports-[backdrop-filter]:bg-bg/80 backdrop-blur',
					'sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
					stuck &&
						'pt-[max(1rem,env(safe-area-inset-top))] sm:pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-[max(2rem,env(safe-area-inset-top))]',
					className
				)}
			>
				{children}
			</div>
		</>
	);
}
