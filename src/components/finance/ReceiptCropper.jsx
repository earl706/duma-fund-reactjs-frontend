import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';

import { cn } from '../../lib/format';

const MIN_CROP = 64;

const HANDLES = [
	{ id: 'n', className: 'top-1 left-1/2 -translate-x-1/2 cursor-ns-resize' },
	{ id: 's', className: 'bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize' },
	{ id: 'e', className: 'top-1/2 right-1 -translate-y-1/2 cursor-ew-resize' },
	{ id: 'w', className: 'top-1/2 left-1 -translate-y-1/2 cursor-ew-resize' },
	{ id: 'ne', className: 'top-1 right-1 cursor-nesw-resize' },
	{ id: 'nw', className: 'top-1 left-1 cursor-nwse-resize' },
	{ id: 'se', className: 'bottom-1 right-1 cursor-nwse-resize' },
	{ id: 'sw', className: 'bottom-1 left-1 cursor-nesw-resize' }
];

/**
 * Freeform receipt crop: centered rectangle with drag handles (any aspect),
 * image pans underneath. Zoom is locked so framing is resize + pan only.
 */
export function ReceiptCropper({ imageSrc, onCropPixelsChange }) {
	const stageRef = useRef(null);
	const dragRef = useRef(null);
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [cropSize, setCropSize] = useState(null);

	const reportPixels = useCallback(
		(_area, pixels) => {
			if (pixels) onCropPixelsChange(pixels);
		},
		[onCropPixelsChange]
	);

	const onMediaLoaded = useCallback((mediaSize) => {
		const stage = stageRef.current;
		const maxW = Math.max(MIN_CROP, (stage?.clientWidth || mediaSize.width) - 4);
		const maxH = Math.max(MIN_CROP, (stage?.clientHeight || mediaSize.height) - 4);
		setCropSize({
			width: Math.min(Math.round(mediaSize.width), maxW),
			height: Math.min(Math.round(mediaSize.height), maxH)
		});
		setCrop({ x: 0, y: 0 });
	}, []);

	const onHandlePointerDown = (id, event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!cropSize) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			id,
			startX: event.clientX,
			startY: event.clientY,
			startW: cropSize.width,
			startH: cropSize.height
		};
	};

	const onHandlePointerMove = (event) => {
		const drag = dragRef.current;
		if (!drag) return;
		const stage = stageRef.current;
		const maxW = Math.max(MIN_CROP, (stage?.clientWidth || drag.startW) - 4);
		const maxH = Math.max(MIN_CROP, (stage?.clientHeight || drag.startH) - 4);
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		let width = drag.startW;
		let height = drag.startH;
		if (drag.id.includes('e')) width = drag.startW + dx * 2;
		if (drag.id.includes('w')) width = drag.startW - dx * 2;
		if (drag.id.includes('s')) height = drag.startH + dy * 2;
		if (drag.id.includes('n')) height = drag.startH - dy * 2;
		setCropSize({
			width: Math.round(Math.min(maxW, Math.max(MIN_CROP, width))),
			height: Math.round(Math.min(maxH, Math.max(MIN_CROP, height)))
		});
	};

	const onHandlePointerUp = (event) => {
		if (!dragRef.current) return;
		dragRef.current = null;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			/* already released */
		}
	};

	return (
		<div
			ref={stageRef}
			className="bg-surface-2 relative h-[min(52vh,28rem)] overflow-hidden rounded-md"
		>
			<Cropper
				image={imageSrc}
				crop={crop}
				zoom={1}
				minZoom={1}
				maxZoom={1}
				zoomWithScroll={false}
				showGrid={false}
				roundCropAreaPixels
				objectFit="contain"
				cropShape="rect"
				aspect={cropSize ? cropSize.width / Math.max(1, cropSize.height) : 4 / 3}
				{...(cropSize ? { cropSize } : {})}
				onCropChange={setCrop}
				onCropComplete={reportPixels}
				onCropAreaChange={reportPixels}
				onMediaLoaded={onMediaLoaded}
				style={{
					containerStyle: { background: 'transparent' },
					cropAreaStyle: {
						border: '2px solid var(--primary)',
						color: 'var(--primary)'
					}
				}}
			/>
			{cropSize && (
				<div
					className="pointer-events-none absolute top-1/2 left-1/2 z-10"
					style={{
						width: cropSize.width,
						height: cropSize.height,
						transform: 'translate(-50%, -50%)'
					}}
				>
					{HANDLES.map((handle) => (
						<button
							key={handle.id}
							type="button"
							aria-label={`Resize crop ${handle.id}`}
							className={cn(
								'bg-primary pointer-events-auto absolute h-3 w-3 touch-none rounded-sm',
								handle.className
							)}
							onPointerDown={(e) => onHandlePointerDown(handle.id, e)}
							onPointerMove={onHandlePointerMove}
							onPointerUp={onHandlePointerUp}
							onPointerCancel={onHandlePointerUp}
						/>
					))}
				</div>
			)}
		</div>
	);
}
