import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '../../lib/format';
import { isConvexQuad } from '../../lib/cropImage';

const MIN_SIDE = 24;
const HANDLE_HIT = 20;

const CORNER_IDS = ['tl', 'tr', 'br', 'bl'];
const EDGE_IDS = [
	{ id: 'top', a: 0, b: 1 },
	{ id: 'right', a: 1, b: 2 },
	{ id: 'bottom', a: 2, b: 3 },
	{ id: 'left', a: 3, b: 0 }
];

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function clampCorner(p, naturalW, naturalH) {
	return {
		x: clamp(p.x, 0, Math.max(0, naturalW - 1)),
		y: clamp(p.y, 0, Math.max(0, naturalH - 1))
	};
}

/** Tiny inset so the stroke stays visible on the bitmap edges. */
function edgeTightInsets(naturalW, naturalH) {
	return {
		x: Math.min(4, Math.max(1, Math.floor(naturalW * 0.005))),
		y: Math.min(4, Math.max(1, Math.floor(naturalH * 0.005)))
	};
}

function initialCorners(naturalW, naturalH) {
	const { x: insetX, y: insetY } = edgeTightInsets(naturalW, naturalH);
	return [
		{ x: insetX, y: insetY },
		{ x: naturalW - 1 - insetX, y: insetY },
		{ x: naturalW - 1 - insetX, y: naturalH - 1 - insetY },
		{ x: insetX, y: naturalH - 1 - insetY }
	];
}

function mid(a, b) {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sideLength(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadMinSide(corners) {
	let min = Infinity;
	for (let i = 0; i < 4; i++) {
		min = Math.min(min, sideLength(corners[i], corners[(i + 1) % 4]));
	}
	return min;
}

/**
 * Contain the bitmap in the stage. Letterbox bars stay outside the image box;
 * the crop outline maps only to the bitmap.
 */
function measureContainInStage(stage, naturalW, naturalH) {
	if (!stage || !naturalW || !naturalH) return null;
	const stageRect = stage.getBoundingClientRect();
	const stageW = stageRect.width;
	const stageH = stageRect.height;
	if (stageW < 1 || stageH < 1) return null;

	const scale = Math.min(stageW / naturalW, stageH / naturalH);
	const displayW = naturalW * scale;
	const displayH = naturalH * scale;

	return {
		offsetX: (stageW - displayW) / 2,
		offsetY: (stageH - displayH) / 2,
		displayW,
		displayH,
		naturalW,
		naturalH,
		stageW,
		stageH
	};
}

/**
 * Document-style quad crop: independent edge midpoints + free corners.
 * Corners stay inside the image; output is { corners: [tl, tr, br, bl] }
 * in natural image pixels for perspective warp.
 *
 * Initial quad is edge-tight to the bitmap (not letterbox bars). That default
 * is not reported as a crop — Analyze still sends the full image until the
 * user moves a handle.
 */
export function ReceiptCropper({
	imageSrc,
	onCropPixelsChange,
	initialCorners: initialCornersProp = null,
	className
}) {
	const stageRef = useRef(null);
	const dragRef = useRef(null);
	const initialCornersRef = useRef(initialCornersProp);
	const dirtyRef = useRef(Boolean(initialCornersProp));
	const maskId = useId().replace(/:/g, '');
	const [naturalSize, setNaturalSize] = useState(null);
	const [layout, setLayout] = useState(null);
	const [corners, setCorners] = useState(null);

	const report = useCallback(
		(next) => {
			if (!next || !onCropPixelsChange) return;
			onCropPixelsChange({ corners: next.map((p) => ({ x: p.x, y: p.y })) });
		},
		[onCropPixelsChange]
	);

	const measureLayout = useCallback(() => {
		const next = measureContainInStage(stageRef.current, naturalSize?.w, naturalSize?.h);
		if (next) setLayout(next);
	}, [naturalSize]);

	useEffect(() => {
		measureLayout();
		const stage = stageRef.current;
		if (!stage || typeof ResizeObserver === 'undefined') return undefined;
		const ro = new ResizeObserver(() => measureLayout());
		ro.observe(stage);
		window.addEventListener('resize', measureLayout);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', measureLayout);
		};
	}, [measureLayout, imageSrc]);

	useEffect(() => {
		if (corners && dirtyRef.current) report(corners);
	}, [corners, report]);

	const toDisplay = useCallback(
		(p) => {
			if (!layout) return { x: 0, y: 0 };
			return {
				x: layout.offsetX + (p.x / layout.naturalW) * layout.displayW,
				y: layout.offsetY + (p.y / layout.naturalH) * layout.displayH
			};
		},
		[layout]
	);

	const toNatural = useCallback(
		(clientX, clientY) => {
			if (!layout || !stageRef.current) return null;
			const rect = stageRef.current.getBoundingClientRect();
			const dx = clientX - rect.left - layout.offsetX;
			const dy = clientY - rect.top - layout.offsetY;
			return clampCorner(
				{
					x: (dx / layout.displayW) * layout.naturalW,
					y: (dy / layout.displayH) * layout.naturalH
				},
				layout.naturalW,
				layout.naturalH
			);
		},
		[layout]
	);

	const trySetCorners = useCallback(
		(next, fromUser = false) => {
			if (!naturalSize) return;
			const clamped = next.map((p) => clampCorner(p, naturalSize.w, naturalSize.h));
			if (!isConvexQuad(clamped)) return;
			if (quadMinSide(clamped) < MIN_SIDE) return;
			if (fromUser) dirtyRef.current = true;
			setCorners(clamped);
		},
		[naturalSize]
	);

	const onImageLoad = (event) => {
		const img = event.currentTarget;
		const w = img.naturalWidth || img.width;
		const h = img.naturalHeight || img.height;
		setNaturalSize({ w, h });
		const saved = initialCornersRef.current;
		const hasSaved = Array.isArray(saved) && saved.length === 4 && isConvexQuad(saved);
		dirtyRef.current = hasSaved;
		const start = hasSaved
			? saved.map((p) => clampCorner({ x: Number(p.x), y: Number(p.y) }, w, h))
			: initialCorners(w, h);
		setCorners(start);
		requestAnimationFrame(() => {
			const next = measureContainInStage(stageRef.current, w, h);
			if (next) setLayout(next);
		});
	};

	const onPointerDown = (kind, index, event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!corners) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			kind,
			index,
			startCorners: corners.map((p) => ({ ...p }))
		};
	};

	const onPointerMove = (event) => {
		const drag = dragRef.current;
		if (!drag || !naturalSize) return;
		const point = toNatural(event.clientX, event.clientY);
		if (!point) return;

		if (drag.kind === 'corner') {
			const next = drag.startCorners.map((p) => ({ ...p }));
			next[drag.index] = point;
			trySetCorners(next, true);
			return;
		}

		if (drag.kind === 'edge') {
			const edge = EDGE_IDS[drag.index];
			const startA = drag.startCorners[edge.a];
			const startB = drag.startCorners[edge.b];
			const startMid = mid(startA, startB);
			const dx = point.x - startMid.x;
			const dy = point.y - startMid.y;
			const next = drag.startCorners.map((p) => ({ ...p }));
			next[edge.a] = clampCorner(
				{ x: startA.x + dx, y: startA.y + dy },
				naturalSize.w,
				naturalSize.h
			);
			next[edge.b] = clampCorner(
				{ x: startB.x + dx, y: startB.y + dy },
				naturalSize.w,
				naturalSize.h
			);
			trySetCorners(next, true);
		}
	};

	const onPointerUp = (event) => {
		if (!dragRef.current) return;
		dragRef.current = null;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			/* already released */
		}
	};

	const displayCorners = useMemo(
		() => (corners && layout ? corners.map(toDisplay) : null),
		[corners, layout, toDisplay]
	);

	const polygonPoints = displayCorners ? displayCorners.map((p) => `${p.x},${p.y}`).join(' ') : '';
	const stageW = Math.max(1, layout?.stageW || 1);
	const stageH = Math.max(1, layout?.stageH || 1);

	return (
		<div
			ref={stageRef}
			className={cn(
				'bg-surface-2 relative touch-none overflow-hidden rounded-md select-none',
				className || 'h-[min(52vh,28rem)]'
			)}
		>
			<img
				src={imageSrc}
				alt="Receipt to crop"
				draggable={false}
				onLoad={onImageLoad}
				className="pointer-events-none absolute max-w-none"
				style={
					layout
						? {
								left: layout.offsetX,
								top: layout.offsetY,
								width: layout.displayW,
								height: layout.displayH
							}
						: { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0 }
				}
			/>

			{displayCorners && layout && (
				<svg
					className="absolute inset-0 z-10 h-full w-full"
					viewBox={`0 0 ${stageW} ${stageH}`}
					preserveAspectRatio="none"
					aria-hidden={false}
				>
					<defs>
						<mask id={maskId}>
							<rect x="0" y="0" width={stageW} height={stageH} fill="white" />
							<polygon points={polygonPoints} fill="black" />
						</mask>
					</defs>
					<rect
						x="0"
						y="0"
						width={stageW}
						height={stageH}
						fill="rgba(0,0,0,0.45)"
						mask={`url(#${maskId})`}
					/>
					<polygon points={polygonPoints} fill="none" stroke="var(--primary)" strokeWidth="2" />

					{EDGE_IDS.map((edge, index) => {
						const p = mid(displayCorners[edge.a], displayCorners[edge.b]);
						return (
							<rect
								key={edge.id}
								x={p.x - 8}
								y={p.y - 8}
								width={16}
								height={16}
								rx={2}
								className="fill-primary cursor-move"
								style={{ touchAction: 'none' }}
								onPointerDown={(e) => onPointerDown('edge', index, e)}
								onPointerMove={onPointerMove}
								onPointerUp={onPointerUp}
								onPointerCancel={onPointerUp}
								aria-label={`Move ${edge.id} edge`}
								role="button"
							/>
						);
					})}

					{CORNER_IDS.map((id, index) => {
						const p = displayCorners[index];
						return (
							<circle
								key={id}
								cx={p.x}
								cy={p.y}
								r={HANDLE_HIT / 2}
								className="fill-primary cursor-move"
								style={{ touchAction: 'none' }}
								onPointerDown={(e) => onPointerDown('corner', index, e)}
								onPointerMove={onPointerMove}
								onPointerUp={onPointerUp}
								onPointerCancel={onPointerUp}
								aria-label={`Move ${id} corner`}
								role="button"
							/>
						);
					})}
				</svg>
			)}

			{!corners && (
				<div className="text-muted absolute inset-0 flex items-center justify-center text-sm">
					Loading image…
				</div>
			)}
		</div>
	);
}
