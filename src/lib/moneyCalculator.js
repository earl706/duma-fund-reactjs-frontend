/**
 * Pure money-helper calculator engine (display / accumulator / operator).
 * Memory lives in the Zustand store; this module only formats and reduces state.
 */

export function createCalculatorState(seed = '0') {
	const display = normalizeSeed(seed);
	return {
		display,
		accumulator: null,
		operator: null,
		fresh: true,
		error: null
	};
}

export function normalizeSeed(value) {
	if (value == null || value === '') return '0';
	const cleaned = String(value)
		.trim()
		.replace(/,/g, '')
		.replace(/[₱$€£¥]/g, '');
	const n = Number(cleaned);
	if (!Number.isFinite(n)) return '0';
	return stripTrailingZeros(String(n));
}

/** Half-up to 2 decimal places for Use into money/qty fields. */
export function formatApplyValue(n, { clampNonNegative = true } = {}) {
	let value = Number(n);
	if (!Number.isFinite(value)) value = 0;
	if (clampNonNegative && value < 0) value = 0;
	return (Math.round(value * 100) / 100).toFixed(2);
}

function stripTrailingZeros(text) {
	if (!text.includes('.')) return text;
	return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function parseDisplay(display) {
	const n = Number(String(display).replace(/,/g, ''));
	return Number.isFinite(n) ? n : 0;
}

function formatDisplay(n) {
	if (!Number.isFinite(n)) return 'Error';
	if (Object.is(n, -0)) return '0';
	const abs = Math.abs(n);
	if (abs !== 0 && (abs >= 1e12 || abs < 1e-8)) {
		return stripTrailingZeros(n.toPrecision(10));
	}
	return stripTrailingZeros(String(n));
}

function applyOp(left, op, right) {
	switch (op) {
		case '+':
			return left + right;
		case '-':
			return left - right;
		case '*':
			return left * right;
		case '/':
			if (right === 0) return NaN;
			return left / right;
		default:
			return right;
	}
}

export function inputDigit(state, digit) {
	const d = String(digit);
	if (state.error) return createCalculatorState(d === '.' ? '0.' : d);
	if (state.fresh) {
		if (d === '.') return { ...state, display: '0.', fresh: false, error: null };
		return { ...state, display: d, fresh: false, error: null };
	}
	if (d === '.') {
		if (state.display.includes('.')) return state;
		return { ...state, display: `${state.display}.` };
	}
	if (state.display === '0') return { ...state, display: d };
	if (state.display === '-0') return { ...state, display: `-${d}` };
	if (state.display.replace('-', '').replace('.', '').length >= 14) return state;
	return { ...state, display: `${state.display}${d}` };
}

export function inputOperator(state, nextOp) {
	if (state.error) return createCalculatorState('0');
	const current = parseDisplay(state.display);
	if (state.operator && !state.fresh) {
		const result = applyOp(state.accumulator ?? 0, state.operator, current);
		if (!Number.isFinite(result)) {
			return { ...createCalculatorState('0'), error: 'Error', display: 'Error' };
		}
		return {
			display: formatDisplay(result),
			accumulator: result,
			operator: nextOp,
			fresh: true,
			error: null
		};
	}
	return {
		...state,
		accumulator: current,
		operator: nextOp,
		fresh: true,
		error: null
	};
}

export function inputEquals(state) {
	if (state.error) return createCalculatorState('0');
	if (!state.operator) return { ...state, fresh: true };
	const current = parseDisplay(state.display);
	const result = applyOp(state.accumulator ?? 0, state.operator, current);
	if (!Number.isFinite(result)) {
		return { ...createCalculatorState('0'), error: 'Error', display: 'Error' };
	}
	return {
		display: formatDisplay(result),
		accumulator: null,
		operator: null,
		fresh: true,
		error: null
	};
}

/**
 * % rule: with pending binary op, a ⊕ b% → a ⊕ (a × b/100);
 * with no pending op, n% → n/100.
 */
export function inputPercent(state) {
	if (state.error) return createCalculatorState('0');
	const current = parseDisplay(state.display);
	if (state.operator != null && state.accumulator != null) {
		const pct = (state.accumulator * current) / 100;
		return { ...state, display: formatDisplay(pct), fresh: true, error: null };
	}
	return { ...state, display: formatDisplay(current / 100), fresh: true, error: null };
}

export function clearAll() {
	return createCalculatorState('0');
}

export function backspace(state) {
	if (state.error) return createCalculatorState('0');
	if (state.fresh) return state;
	const next = state.display.slice(0, -1);
	if (!next || next === '-' || next === '-0') {
		return { ...state, display: '0', fresh: true };
	}
	return { ...state, display: next };
}

export function seedFromValue(value) {
	return createCalculatorState(normalizeSeed(value));
}

export function displayNumber(state) {
	if (state.error || state.display === 'Error') return 0;
	return parseDisplay(state.display);
}
