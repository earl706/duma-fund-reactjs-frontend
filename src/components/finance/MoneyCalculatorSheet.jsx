import { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';

import {
	backspace,
	clearAll,
	createCalculatorState,
	displayNumber,
	formatApplyValue,
	inputDigit,
	inputEquals,
	inputOperator,
	inputPercent,
	seedFromValue
} from '../../lib/moneyCalculator';
import { cn } from '../../lib/format';
import { useCalculatorStore } from '../../stores/calculatorStore';
import { Button, Modal } from '../ui';

const PAD = [
	['MC', 'MR', 'M+', 'C'],
	['7', '8', '9', '/'],
	['4', '5', '6', '*'],
	['1', '2', '3', '-'],
	['0', '.', '%', '+'],
	['=']
];

function PadKey({ label, onClick, className, wide }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'border-line bg-surface-2 text-fg hover:bg-surface active:bg-line h-11 cursor-pointer rounded-md border text-sm font-semibold tabular-nums transition-colors',
				wide && 'col-span-4',
				className
			)}
		>
			{label}
		</button>
	);
}

export function MoneyCalculatorSheet() {
	const open = useCalculatorStore((s) => s.open);
	const seedToken = useCalculatorStore((s) => s.seedToken);
	const seedValue = useCalculatorStore((s) => s.seedValue);
	const seedFromBind = useCalculatorStore((s) => s.seedFromBind);
	const bind = useCalculatorStore((s) => s.bind);
	const memory = useCalculatorStore((s) => s.memory);
	const closeCalculator = useCalculatorStore((s) => s.closeCalculator);
	const memoryAdd = useCalculatorStore((s) => s.memoryAdd);
	const memoryRecall = useCalculatorStore((s) => s.memoryRecall);
	const memoryClear = useCalculatorStore((s) => s.memoryClear);

	const [engine, setEngine] = useState(() => createCalculatorState('0'));

	useEffect(() => {
		if (!open) return;
		if (seedFromBind) {
			setEngine(seedFromValue(seedValue ?? bind?.value ?? '0'));
		}
	}, [open, seedToken, seedFromBind, seedValue, bind?.value]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === 'Escape') {
				// Capture so an underlying modal (receipt / edit) does not also close.
				e.preventDefault();
				e.stopImmediatePropagation();
				closeCalculator();
				return;
			}
			if (e.key >= '0' && e.key <= '9') {
				e.preventDefault();
				setEngine((s) => inputDigit(s, e.key));
				return;
			}
			if (e.key === '.') {
				e.preventDefault();
				setEngine((s) => inputDigit(s, '.'));
				return;
			}
			if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
				e.preventDefault();
				setEngine((s) => inputOperator(s, e.key));
				return;
			}
			if (e.key === 'Enter' || e.key === '=') {
				e.preventDefault();
				setEngine((s) => inputEquals(s));
				return;
			}
			if (e.key === '%') {
				e.preventDefault();
				setEngine((s) => inputPercent(s));
				return;
			}
			if (e.key === 'Backspace') {
				e.preventDefault();
				setEngine((s) => backspace(s));
				return;
			}
			if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				setEngine(clearAll());
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [open, closeCalculator]);

	const handlePad = (key) => {
		if (key === 'C') {
			setEngine(clearAll());
			return;
		}
		if (key === 'MC') {
			memoryClear();
			return;
		}
		if (key === 'MR') {
			const recalled = memoryRecall();
			if (recalled == null) return;
			setEngine(seedFromValue(String(recalled)));
			return;
		}
		if (key === 'M+') {
			memoryAdd(displayNumber(engine));
			return;
		}
		if (key === '%') {
			setEngine((s) => inputPercent(s));
			return;
		}
		if (key === '=') {
			setEngine((s) => inputEquals(s));
			return;
		}
		if (key === '+' || key === '-' || key === '*' || key === '/') {
			setEngine((s) => inputOperator(s, key));
			return;
		}
		setEngine((s) => inputDigit(s, key));
	};

	const canUse = Boolean(bind?.onApply);
	const handleUse = () => {
		if (!bind?.onApply) return;
		const value = formatApplyValue(displayNumber(engine), {
			clampNonNegative: bind.clampNonNegative !== false
		});
		bind.onApply(value);
		closeCalculator();
	};

	const opLabel = { '/': '÷', '*': '×', '-': '−', '+': '+' };

	return (
		<Modal
			open={open}
			onClose={closeCalculator}
			title="Calculator"
			size="sm"
			zClassName="z-[60]"
			footer={
				<>
					<Button variant="secondary" onClick={closeCalculator}>
						Close
					</Button>
					<Button onClick={handleUse} disabled={!canUse}>
						Use
					</Button>
				</>
			}
		>
			<div data-money-calculator className="space-y-3">
				<div className="border-line bg-surface-2 rounded-md border px-3 py-3">
					<div className="text-muted flex items-center justify-between text-[10px] font-semibold uppercase">
						<span className="inline-flex items-center gap-1">
							<Calculator size={12} />
							{bind?.label ? `Bound: ${bind.label}` : 'No field bound'}
						</span>
						{memory != null && (
							<span className="tabular-nums">
								M {formatApplyValue(memory, { clampNonNegative: false })}
							</span>
						)}
					</div>
					<p className="text-fg mt-1 text-right text-2xl font-semibold tracking-tight tabular-nums">
						{engine.display}
					</p>
					{!canUse && (
						<p className="text-muted mt-1 text-xs">Focus a money field first to enable Use.</p>
					)}
				</div>

				<div className="grid grid-cols-4 gap-1.5">
					{PAD.flatMap((row) =>
						row.map((key) => (
							<PadKey
								key={key}
								label={opLabel[key] || key}
								wide={key === '='}
								onClick={() => handlePad(key)}
								className={
									key === '='
										? 'bg-primary text-primary-fg hover:bg-primary border-primary'
										: key === 'C' || key === 'MC' || key === 'MR' || key === 'M+'
											? 'text-muted'
											: undefined
								}
							/>
						))
					)}
				</div>
			</div>
		</Modal>
	);
}
