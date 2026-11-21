const KEYS = [
  ['AC', 'clear'], ['⌫', 'back'], ['%', 'percent'], ['÷', 'op'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'op'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'op'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'op'],
  ['±', 'negate'], ['0', 'digit'], ['.', 'dot'], ['=', 'equals'],
];

export function mountCalculator(root) {
  root.innerHTML = `
    <div class="calc">
      <div class="calc-display">
        <div class="calc-expression" id="calc-expression">&nbsp;</div>
        <div class="calc-value" id="calc-value">0</div>
      </div>
      <div class="calc-grid" id="calc-grid"></div>
    </div>`;

  const valueEl = root.querySelector('#calc-value');
  const expressionEl = root.querySelector('#calc-expression');
  const grid = root.querySelector('#calc-grid');

  let current = '0';
  let previous = null;
  let operator = null;
  let replace = false;

  const format = (value) => {
    if (!Number.isFinite(value)) return 'Error';
    const rounded = Math.round(value * 1e10) / 1e10;
    if (Math.abs(rounded) >= 1e12) return rounded.toExponential(5);
    return String(rounded);
  };

  const compute = (a, op, b) => {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  };

  function paint() {
    valueEl.textContent = current;
    expressionEl.innerHTML = previous !== null && operator
      ? `${format(previous)} ${operator}`
      : '&nbsp;';
  }

  function inputDigit(digit) {
    if (replace || current === '0') {
      current = digit;
      replace = false;
    } else if (current.length < 14) {
      current += digit;
    }
    paint();
  }

  function inputDot() {
    if (replace) {
      current = '0.';
      replace = false;
    } else if (!current.includes('.')) {
      current += '.';
    }
    paint();
  }

  function applyOperator(op) {
    const value = Number(current);
    if (operator && previous !== null && !replace) {
      const result = compute(previous, operator, value);
      previous = result;
      current = format(result);
    } else {
      previous = value;
    }
    operator = op;
    replace = true;
    paint();
  }

  function equals() {
    if (operator === null || previous === null) return;
    const result = compute(previous, operator, Number(current));
    current = format(result);
    previous = null;
    operator = null;
    replace = true;
    paint();
  }

  function clearAll() {
    current = '0';
    previous = null;
    operator = null;
    replace = false;
    paint();
  }

  for (const [label, action] of KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calc-key ${action === 'op' ? 'op' : ''} ${action === 'equals' ? 'equal' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      if (action === 'digit') inputDigit(label);
      else if (action === 'dot') inputDot();
      else if (action === 'op') applyOperator(label);
      else if (action === 'equals') equals();
      else if (action === 'clear') clearAll();
      else if (action === 'back') {
        current = current.length > 1 ? current.slice(0, -1) : '0';
        paint();
      } else if (action === 'negate') {
        current = current.startsWith('-') ? current.slice(1) : `-${current}`;
        paint();
      } else if (action === 'percent') {
        current = format(Number(current) / 100);
        paint();
      }
    });
    grid.append(button);
  }

  paint();
}
