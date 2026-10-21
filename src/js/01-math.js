/* =====================================================================
   FCMath — parse, evaluate, pretty-print and transform functions of x
   ===================================================================== */
var FCMath = (function () {
  const CONSTS = { pi: Math.PI, e: Math.E };
  const FUNC_ARITY = { min: 2, max: 2 };
  const ALIASES = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', sgn: 'sign' };
  // NOTE: no 'asin'/'acos'/'atan' — students type "asin(x)" meaning a·sin(x). Use arcsin or sin^-1.
  const NAMES = ['arcsin', 'arccos', 'arctan', 'floor', 'round', 'sqrt', 'cbrt', 'sinh', 'cosh', 'tanh', 'sign', 'ceil',
    'abs', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'log', 'sgn', 'min', 'max', 'ln', 'pi'];
  const FUNCS = new Set(NAMES.filter((n) => n !== 'pi'));
  const F1 = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    sec: (t) => 1 / Math.cos(t), csc: (t) => 1 / Math.sin(t), cot: (t) => Math.cos(t) / Math.sin(t),
    asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  };
  const INVERSE = { sin: 'asin', cos: 'acos', tan: 'atan' };

  class MathError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }

  // ---------------------------------------------------------------- normalize
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', '⁽': '(', '⁾': ')', 'ˣ': 'x', '·': '.' };
  function normalize(src) {
    let s = String(src == null ? '' : src);
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺⁽⁾ˣ]+/g, (m) => '^(' + Array.from(m).map((c) => SUP[c]).join('') + ')');
    s = s.replace(/[−–—‒]/g, '-').replace(/[×⋅∙✕·]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi')
      .replace(/\*\*/g, '^').replace(/[[{]/g, '(').replace(/[\]}]/g, ')').replace(/∛/g, 'cbrt');
    s = s.toLowerCase();
    s = s.replace(/^\s*(?:[a-z]\s*\(\s*x\s*\)|y)\s*=\s*/, '');
    return s;
  }

  // ---------------------------------------------------------------- tokenize
  function tokenize(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
        if (!m) throw new MathError('A lonely "." — decimals look like 0.5', i);
        if (s[i + m[0].length] === '.') throw new MathError('That number has two decimal points.', i);
        toks.push({ t: 'num', v: parseFloat(m[0]), pos: i, raw: m[0] });
        i += m[0].length;
        continue;
      }
      if (/[a-z]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-z]/.test(s[j])) j++;
        const run = s.slice(i, j);
        let k = 0;
        while (k < run.length) {
          let matched = null;
          for (const n of NAMES) {
            if (run.startsWith(n, k)) { matched = n; break; }
          }
          if (matched) {
            toks.push({ t: 'name', v: matched, kind: matched === 'pi' ? 'const' : 'func', pos: i + k });
            k += matched.length;
          } else {
            const ch = run[k];
            let kind = 'param';
            if (ch === 'x') kind = 'var';
            else if (ch === 'e') kind = 'const';
            else if (ch === 'y') throw new MathError('Use x as the input letter — y is the output (the height of the track)!', i + k);
            toks.push({ t: 'name', v: ch, kind, pos: i + k });
            k++;
          }
        }
        i = j;
        continue;
      }
      if ('+-*/^'.includes(c)) { toks.push({ t: 'op', v: c, pos: i }); i++; continue; }
      if (c === '(' || c === ')' || c === ',' || c === '|' || c === '_') { toks.push({ t: c, pos: i }); i++; continue; }
      if (c === '√') { toks.push({ t: 'sqrt', pos: i }); i++; continue; }
      if (c === '=') throw new MathError('Only type the right side — for example  x^2 - 4  (no "=").', i);
      if (c === '<' || c === '>') throw new MathError('Inequalities can\'t be tracks — type a function like  x^2 - 4', i);
      throw new MathError('I don\'t know the symbol "' + c + '".', i);
    }
    toks.push({ t: 'eof', pos: s.length });
    return toks;
  }

  // ---------------------------------------------------------------- parse
  /** Parse a function: either one expression, or a piecewise function written {expr if cond; expr if cond}. */
  function parse(src) {
    const inner = piecewiseInner(src);
    if (inner !== null) return parsePiecewise(inner);
    const t = String(src == null ? '' : src).trim();
    const looksPW = /[<>≤≥;]/.test(t) || /\bif\b/i.test(t);
    if (/^(?:[a-zA-Z]\s*\(\s*x\s*\)\s*=\s*)?\{/.test(t) && !/\}$/.test(t) && looksPW) return { ok: false, error: 'This looks like a piecewise function, but the closing brace } is missing at the end.' };
    if (/\bif\b/i.test(t) && /[<>≤≥]/.test(t)) return { ok: false, error: 'For a piecewise function, wrap the pieces in braces: {2x if 0 <= x < 3; 6 if 3 <= x <= 5} — or switch to 🧩 Pieces.' };
    return parseSingle(src);
  }

  function parseSingle(src) {
    const norm = normalize(src);
    if (!norm.trim()) return { ok: false, error: 'Type a function of x — for example  x^2 - 4' };
    let toks;
    try { toks = tokenize(norm); } catch (e) { return { ok: false, error: e.message, pos: e.pos, norm }; }
    let i = 0;
    let absDepth = 0;
    const peek = () => toks[i];
    const next = () => toks[i++];
    const err = (msg, tk) => new MathError(msg, tk ? tk.pos : undefined);

    function startsOperand(tk) {
      if (tk.t === 'num' || tk.t === 'name' || tk.t === '(' || tk.t === 'sqrt') return true;
      if (tk.t === '|') return absDepth === 0;
      return false;
    }
    function expect(t, msg) {
      const tk = next();
      if (tk.t !== t) throw err(msg, tk);
      return tk;
    }
    function parseExpr() {
      let left = parseTerm();
      for (;;) {
        const tk = peek();
        if (tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
          next();
          if (peek().t === 'eof') throw err('The function ends with "' + tk.v + '" — something is missing after it.', tk);
          const right = parseTerm();
          left = { type: tk.v === '+' ? 'add' : 'sub', left, right };
        } else break;
      }
      return left;
    }
    function parseTerm() {
      let left = parseUnary();
      for (;;) {
        const tk = peek();
        if (tk.t === 'op' && (tk.v === '*' || tk.v === '/')) {
          next();
          if (peek().t === 'eof') throw err('The function ends with "' + tk.v + '" — something is missing after it.', tk);
          const right = parseUnary();
          left = { type: tk.v === '*' ? 'mul' : 'div', left, right };
        } else if (startsOperand(tk)) {
          const right = parsePower();
          left = { type: 'mul', left, right, implicit: true };
        } else break;
      }
      return left;
    }
    function parseUnary() {
      const tk = peek();
      if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
        next();
        const arg = parseUnary();
        return tk.v === '-' ? { type: 'neg', arg } : arg;
      }
      return parsePower();
    }
    function parsePower() {
      const base = parsePrimary();
      if (peek().t === 'op' && peek().v === '^') {
        const tk = next();
        if (peek().t === 'eof') throw err('Something is missing after "^" — like x^2', tk);
        const exp = parseUnary();
        return { type: 'pow', base, exp };
      }
      return base;
    }
    function parseFuncCall(tk) {
      let name = ALIASES[tk.v] || tk.v;
      let base = null;
      let power = null;
      if (name === 'log' && peek().t === '_') { next(); base = parsePrimary(); }
      if (peek().t === 'op' && peek().v === '^') {
        // sin^2(x) or sin^-1(x)
        next();
        let neg = false;
        if (peek().t === 'op' && peek().v === '-') { next(); neg = true; }
        const ptk = next();
        if (ptk.t !== 'num') throw err('After ' + name + '^ put a number, like ' + name + '^2(x)', ptk);
        if (neg && ptk.v === 1 && INVERSE[name]) name = INVERSE[name];
        else power = { type: 'num', value: neg ? -ptk.v : ptk.v };
      }
      const arity = FUNC_ARITY[name] || 1;
      let args;
      if (peek().t === '(') {
        next();
        if (peek().t === ')') throw err(name + '( ) is empty — put something inside, like ' + name + '(x)', peek());
        args = [parseExpr()];
        while (peek().t === ',') { next(); args.push(parseExpr()); }
        expect(')', 'Missing a closing parenthesis ")" after ' + name + '(…');
        if (args.length !== arity) throw err(name + ' needs ' + arity + ' input' + (arity > 1 ? 's separated by a comma, like ' + name + '(x, 2)' : ''), tk);
      } else {
        if (arity !== 1) throw err('Use parentheses with ' + name + ', like ' + name + '(x, 2)', tk);
        if (!startsOperand(peek())) throw err(name + ' needs an input, like ' + name + '(x)', tk);
        let arg = parsePower();
        while (startsOperand(peek()) && !(peek().t === 'name' && peek().kind === 'func') && peek().t !== 'sqrt' && peek().t !== '|') {
          arg = { type: 'mul', left: arg, right: parsePower(), implicit: true };
        }
        args = [arg];
      }
      let node = { type: 'func', name, args };
      if (base) node.base = base;
      if (power) node = { type: 'pow', base: node, exp: power };
      return node;
    }
    function parsePrimary() {
      const tk = next();
      switch (tk.t) {
        case 'num': return { type: 'num', value: tk.v };
        case '(': {
          if (peek().t === ')') throw err('Empty parentheses ( ) — put something inside.', tk);
          const e = parseExpr();
          expect(')', 'Missing a closing parenthesis ")".');
          return e;
        }
        case 'name':
          if (tk.kind === 'var') return { type: 'var' };
          if (tk.kind === 'const') return { type: 'const', name: tk.v };
          if (tk.kind === 'param') return { type: 'param', name: tk.v };
          return parseFuncCall(tk);
        case 'sqrt': {
          if (!startsOperand(peek())) throw err('√ needs something after it, like √(x)', tk);
          return { type: 'func', name: 'sqrt', args: [parsePower()] };
        }
        case '|': {
          absDepth++;
          const e = parseExpr();
          expect('|', 'Missing the closing bar | for absolute value.');
          absDepth--;
          return { type: 'func', name: 'abs', args: [e] };
        }
        case 'eof': throw err('Something is missing at the end.', tk);
        case ')': throw err('There\'s an extra ")" — or something is missing before it.', tk);
        case ',': throw err('Commas only go inside min( , ) or max( , ).', tk);
        case '_': throw err('"_" is only used for log bases, like log_2(x).', tk);
        case 'op':
          if (tk.v === '^') throw err('"^" needs something before it, like x^2', tk);
          throw err('I didn\'t expect "' + tk.v + '" here — is something missing before it?', tk);
        default: throw err('I got confused here.', tk);
      }
    }

    try {
      const ast = parseExpr();
      const tk = peek();
      if (tk.t !== 'eof') {
        if (tk.t === ')') throw err('There\'s an extra ")" — or a missing "(".', tk);
        if (tk.t === '|') throw err('Unmatched absolute value bar |', tk);
        throw err('I couldn\'t understand the part starting at "' + norm.slice(tk.pos, tk.pos + 6) + '".', tk);
      }
      const params = collectParams(ast);
      return { ok: true, ast, params, norm };
    } catch (e) {
      if (e instanceof MathError) return { ok: false, error: e.message, pos: e.pos, norm };
      throw e;
    }
  }

  // ---------------------------------------------------------------- piecewise functions
  /** If src looks like {… if … ; …}, return the text inside the braces, else null. */
  function piecewiseInner(src) {
    let s = String(src == null ? '' : src);
    s = s.replace(/[−–—‒]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/=</g, '<=').replace(/=>/g, '>=');
    s = s.replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, '').trim();
    if (!(s.startsWith('{') && s.endsWith('}'))) return null;
    const inner = s.slice(1, -1);
    // braces used as plain parentheses, like {x + 1}·2, are not piecewise
    if (!/[<>;]/.test(inner) && !/\b(?:if|for|when|where)\b/i.test(inner)) return null;
    return inner;
  }

  function parsePiecewise(inner) {
    const parts = inner.split(/;|\n/).map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return { ok: false, error: 'The braces are empty — add pieces like {2x if 0 <= x < 3; 6 if 3 <= x <= 5}' };
    const pieces = [];
    for (let k = 0; k < parts.length; k++) {
      const label = 'Piece ' + (k + 1) + ': ';
      const t = parts[k];
      let exprText, condText;
      const m = /^(.*?)\s*\b(?:if|for|when|where)\b\s*(.*)$/i.exec(t);
      if (m) { exprText = m[1]; condText = m[2]; }
      else {
        // "expr, condition" — the last top-level comma (or colon) before a comparison
        let depth = 0, cut = -1;
        for (let i = 0; i < t.length; i++) {
          const c = t[i];
          if (c === '(' || c === '[') depth++;
          else if (c === ')' || c === ']') depth--;
          else if ((c === ',' || c === ':') && depth === 0 && /[<>]/.test(t.slice(i + 1))) cut = i;
        }
        if (cut < 0) return { ok: false, error: label + 'add a condition, like  2x + 1 if 0 <= x < 2', piece: k };
        exprText = t.slice(0, cut); condText = t.slice(cut + 1);
      }
      if (!exprText.trim()) return { ok: false, error: label + 'the formula is missing before "if".', piece: k };
      const r = parseSingle(exprText);
      if (!r.ok) return { ok: false, error: label + r.error, piece: k };
      const cond = parseCondition(condText);
      if (!cond.ok) return { ok: false, error: label + cond.error, piece: k };
      pieces.push({ ast: r.ast, lo: cond.lo, hi: cond.hi, src: exprText.trim() });
    }
    const node = { type: 'piecewise', pieces };
    return { ok: true, ast: node, params: collectParams(node), piecewise: true };
  }

  /** "0 <= x < 2", "x >= 3", "2 < x", "x > 0 and x <= 4" → {lo:{ast,incl}, hi:{ast,incl}} */
  function parseCondition(text) {
    const s = String(text).trim().toLowerCase().replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/=</g, '<=').replace(/=>/g, '>=');
    if (!s) return { ok: false, error: 'the condition is empty — write something like 0 <= x < 2' };
    let lo = null, hi = null;
    for (const clause of s.split(/\band\b|&&|,/).map((c) => c.trim()).filter(Boolean)) {
      const toks = clause.split(/(<=|>=|<|>)/).map((t) => t.trim());
      if (toks.length < 3) return { ok: false, error: 'use < or ≤ to say which x values this piece covers, like 0 <= x < 2' };
      for (let i = 0; i + 2 < toks.length; i += 2) {
        const A = toks[i], op = toks[i + 1], B = toks[i + 2];
        const aIsX = A === 'x', bIsX = B === 'x';
        if (aIsX === bIsX) return { ok: false, error: aIsX ? 'x appears on both sides of "' + op + '"' : 'each comparison needs x, like 0 <= x < 2' };
        const other = aIsX ? B : A;
        if (!other) return { ok: false, error: 'a number is missing next to "' + op + '"' };
        const r = parseSingle(other);
        if (!r.ok) return { ok: false, error: '"' + other + '": ' + r.error };
        if (containsVar(r.ast)) return { ok: false, error: 'the limits should be numbers, like 0 <= x < 2' };
        const less = op === '<' || op === '<=';
        const bound = { ast: r.ast, incl: op.length === 2 };
        if (aIsX ? less : !less) { if (hi) return { ok: false, error: 'this piece has two upper limits' }; hi = bound; }
        else { if (lo) return { ok: false, error: 'this piece has two lower limits' }; lo = bound; }
      }
    }
    if (!lo && !hi) return { ok: false, error: 'the condition needs limits for x, like 0 <= x < 2' };
    return { ok: true, lo, hi };
  }

  /** Evaluate the pieces' limits and build the combined function. */
  function compilePW(node, P) {
    const pieces = node.pieces.map((p, k) => {
      const lo = p.lo ? evalConst(p.lo.ast, P) : -Infinity;
      const hi = p.hi ? evalConst(p.hi.ast, P) : Infinity;
      return { k, ast: p.ast, src: p.src, f: compile(p.ast, P), lo, hi, loIncl: p.lo ? p.lo.incl : false, hiIncl: p.hi ? p.hi.incl : false, coeffs: toPoly(p.ast, P) };
    });
    const sorted = pieces.slice().sort((A, B) => A.lo - B.lo || A.hi - B.hi);
    const inPiece = (p, x) => (x > p.lo || (p.loIncl && x === p.lo)) && (x < p.hi || (p.hiIncl && x === p.hi));
    const pieceAt = (x) => { for (const p of sorted) if (inPiece(p, x)) return p; return null; };
    const fn = (x) => { for (const p of sorted) if (inPiece(p, x)) return p.f(x); return NaN; };
    return { pieces, sorted, fn, pieceAt, inPiece };
  }

  function pwCondText(p) {
    const lo = p.lo, hi = p.hi;
    if (lo && hi) return toText(lo.ast) + (lo.incl ? ' <= ' : ' < ') + 'x' + (hi.incl ? ' <= ' : ' < ') + toText(hi.ast);
    if (lo) return 'x' + (lo.incl ? ' >= ' : ' > ') + toText(lo.ast);
    return 'x' + (hi.incl ? ' <= ' : ' < ') + toText(hi.ast);
  }
  function pwCondHTML(p) {
    const lo = p.lo, hi = p.hi, X = '<i class="m-x">x</i>';
    if (lo && hi) return toHTML(lo.ast) + (lo.incl ? ' ≤ ' : ' &lt; ') + X + (hi.incl ? ' ≤ ' : ' &lt; ') + toHTML(hi.ast);
    if (lo) return X + (lo.incl ? ' ≥ ' : ' &gt; ') + toHTML(lo.ast);
    return X + (hi.incl ? ' ≤ ' : ' &lt; ') + toHTML(hi.ast);
  }
  const BRACE_SVG = '<svg viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true"><path d="M10.5,1.5 C5.5,1.5 6.2,12 6.2,24 L6.2,40 C6.2,46.5 4.8,50 1.5,50 C4.8,50 6.2,53.5 6.2,60 L6.2,76 C6.2,88 5.5,98.5 10.5,98.5" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  function pwHTML(n, stacked) {
    const dot = (k) => '<span class="m-pw-dot" style="background:' + FC.pieceColor(k) + '"></span>';
    if (!stacked) {
      return '<span class="m-pw-inline">{ ' + n.pieces.map((p, k) => '<span class="m-pw-piece">' + dot(k) + toHTML(p.ast) + ' <span class="m-pw-if">if</span> ' + pwCondHTML(p) + (k < n.pieces.length - 1 ? '<span class="m-pw-sep">;</span>' : '') + '</span>').join(' ') + ' }</span>';
    }
    return '<span class="m-pw"><span class="m-pw-brace">' + BRACE_SVG + '</span><span class="m-pw-rows">' +
      n.pieces.map((p, k) => '<span class="m-pw-row">' + dot(k) + '<span class="m-pw-expr">' + toHTML(p.ast) + '</span><span class="m-pw-cond"><span class="m-pw-if">if</span> ' + pwCondHTML(p) + '</span></span>').join('') +
      '</span></span>';
  }
  const mapPW = (pw, fn) => ({ type: 'piecewise', pieces: pw.pieces.map((p) => Object.assign({}, p, { ast: fn(p.ast) })) });

  function collectParams(ast) {
    const set = new Set();
    walk(ast, (n) => { if (n.type === 'param') set.add(n.name); });
    return Array.from(set).sort();
  }
  function walk(n, fn) {
    fn(n);
    if (n.left) walk(n.left, fn);
    if (n.right) walk(n.right, fn);
    if (n.arg) walk(n.arg, fn);
    if (n.base) walk(n.base, fn);
    if (n.exp) walk(n.exp, fn);
    if (n.args) n.args.forEach((a) => walk(a, fn));
    if (n.pieces) n.pieces.forEach((p) => { walk(p.ast, fn); if (p.lo) walk(p.lo.ast, fn); if (p.hi) walk(p.hi.ast, fn); });
  }
  function containsVar(n) {
    let found = false;
    walk(n, (m) => { if (m.type === 'var') found = true; });
    return found;
  }
  function containsType(n, pred) {
    let found = false;
    walk(n, (m) => { if (pred(m)) found = true; });
    return found;
  }

  // ---------------------------------------------------------------- evaluate
  function toFraction(v, maxQ = 12) {
    for (let q = 1; q <= maxQ; q++) {
      const p = Math.round(v * q);
      if (Math.abs(p / q - v) < 1e-10) return { p, q };
    }
    return null;
  }

  /** Compile an AST into a fast closure f(x). Parameters are read live from P. */
  function compile(node, P) {
    P = P || {};
    switch (node.type) {
      case 'num': { const v = node.value; return () => v; }
      case 'const': { const v = CONSTS[node.name]; return () => v; }
      case 'var': return (x) => x;
      case 'param': { const n = node.name; return () => (P[n] === undefined ? 1 : P[n]); }
      case 'neg': { const a = compile(node.arg, P); return (x) => -a(x); }
      case 'add': { const a = compile(node.left, P), b = compile(node.right, P); return (x) => a(x) + b(x); }
      case 'sub': { const a = compile(node.left, P), b = compile(node.right, P); return (x) => a(x) - b(x); }
      case 'mul': { const a = compile(node.left, P), b = compile(node.right, P); return (x) => a(x) * b(x); }
      case 'div': { const a = compile(node.left, P), b = compile(node.right, P); return (x) => a(x) / b(x); }
      case 'pow': return compilePow(node, P);
      case 'piecewise': return compilePW(node, P).fn;
      case 'func': {
        if (node.name === 'min' || node.name === 'max') {
          const a = compile(node.args[0], P), b = compile(node.args[1], P);
          return node.name === 'min' ? (x) => Math.min(a(x), b(x)) : (x) => Math.max(a(x), b(x));
        }
        const a = compile(node.args[0], P);
        if (node.name === 'log' && node.base) {
          const b = compile(node.base, P);
          return (x) => Math.log(a(x)) / Math.log(b(x));
        }
        const f = F1[node.name];
        return (x) => f(a(x));
      }
      default: throw new Error('Unknown node ' + node.type);
    }
  }
  function compilePow(node, P) {
    const b = compile(node.base, P);
    if (!containsVar(node.exp) && !containsType(node.exp, (m) => m.type === 'param')) {
      const e = compile(node.exp, P)(0);
      if (Number.isInteger(e)) {
        if (e === 0) return (x) => { const t = b(x); return isFinite(t) ? 1 : NaN; };
        if (e === 1) return b;
        if (e === 2) return (x) => { const t = b(x); return t * t; };
        if (e === 3) return (x) => { const t = b(x); return t * t * t; };
        return (x) => Math.pow(b(x), e);
      }
      const fr = toFraction(e);
      if (fr && fr.q % 2 === 1) {
        const sign = fr.p % 2 === 0 ? 1 : -1;
        return (x) => { const t = b(x); return t >= 0 ? Math.pow(t, e) : sign * Math.pow(-t, e); };
      }
      return (x) => Math.pow(b(x), e);
    }
    const ex = compile(node.exp, P);
    return (x) => {
      const t = b(x), e = ex(x);
      if (t < 0 && !Number.isInteger(e)) {
        const fr = toFraction(e);
        if (fr && fr.q % 2 === 1) return (fr.p % 2 === 0 ? 1 : -1) * Math.pow(-t, e);
      }
      return Math.pow(t, e);
    };
  }
  function evalConst(node, P) { return compile(node, P)(0); }

  /** Evaluate a constant expression typed by a student (e.g. domain "2pi"). */
  function evalConstExpr(src, P) {
    const r = parse(src);
    if (!r.ok) return { ok: false, error: r.error };
    if (containsVar(r.ast)) return { ok: false, error: 'Use a number here (like -2, 3.5 or 2pi) — not x.' };
    const v = evalConst(r.ast, P);
    if (!isFinite(v)) return { ok: false, error: 'That number isn\'t defined.' };
    return { ok: true, value: v, ast: r.ast };
  }

  // ---------------------------------------------------------------- printing
  const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4, num: 5, var: 5, const: 5, param: 5, func: 5 };
  function prec(n) {
    if (n.type === 'num' && n.value < 0) return 3;
    return PREC[n.type];
  }
  function isNegLike(n) {
    return n.type === 'neg' || (n.type === 'num' && n.value < 0);
  }
  function firstAtom(n) {
    switch (n.type) {
      case 'mul': case 'div': return n.type === 'div' ? 'frac' : firstAtom(n.left);
      case 'pow': return firstAtom(n.base);
      case 'num': return n.value < 0 ? 'neg' : 'num';
      case 'neg': return 'neg';
      case 'add': case 'sub': return 'paren';
      case 'func': return 'func';
      default: return n.type;
    }
  }
  function lastAtom(n) {
    switch (n.type) {
      case 'mul': return lastAtom(n.right);
      case 'pow': return 'pow';
      case 'num': return 'num';
      default: return n.type;
    }
  }
  function numHTML(v) {
    if (v < 0) return '−' + FC.fmt(-v, 4);
    return FC.fmt(v, 4);
  }
  /** Split a leading negative sign off a node (for pretty "a − b" output). */
  function splitNeg(n) {
    if (n.type === 'neg') return n.arg;
    if (n.type === 'num' && n.value < 0) return { type: 'num', value: -n.value };
    if (n.type === 'mul') {
      const l = splitNeg(n.left);
      if (l) return Object.assign({}, n, { left: l });
    }
    if (n.type === 'div') {
      const l = splitNeg(n.left);
      if (l) return Object.assign({}, n, { left: l });
    }
    return null;
  }

  /** opts.stacked: draw a piecewise function with a tall brace (one row per piece). */
  function toHTML(n, opts) {
    switch (n.type) {
      case 'piecewise': return pwHTML(n, opts && opts.stacked);
      case 'num': return numHTML(n.value);
      case 'var': return '<i class="m-x">x</i>';
      case 'param': return '<i class="m-param">' + n.name + '</i>';
      case 'const': return n.name === 'pi' ? '<span class="m-c">π</span>' : '<i class="m-c">e</i>';
      case 'add': {
        const pos = splitNeg(n.right);
        if (pos) return toHTML(n.left) + ' − ' + wrapH(pos, prec(pos) <= 1);
        return toHTML(n.left) + ' + ' + wrapH(n.right, prec(n.right) < 1);
      }
      case 'sub': {
        const pos = splitNeg(n.right);
        if (pos) return toHTML(n.left) + ' + ' + wrapH(pos, prec(pos) <= 1);
        return toHTML(n.left) + ' − ' + wrapH(n.right, prec(n.right) <= 1);
      }
      case 'mul': {
        const L = wrapH(n.left, prec(n.left) < 2);
        const rNeg = isNegLike(n.right);
        const R = wrapH(n.right, prec(n.right) < 2 || rNeg);
        const fa = firstAtom(n.right), la = lastAtom(n.left);
        let dot = false;
        if (!rNeg && (fa === 'num' || fa === 'neg')) dot = true;
        if (la === 'func' && (fa === 'var' || fa === 'param' || fa === 'const')) dot = true;
        if (n.left.type === 'num' && n.right.type === 'num') dot = true;
        const thin = !dot && fa === 'func' && ['var', 'param', 'const', 'func', 'pow'].includes(la);
        return L + (dot ? '·' : thin ? '&thinsp;' : '') + R;
      }
      case 'div':
        return '<span class="m-frac"><span class="m-fn-num">' + toHTML(n.left) + '</span><span class="m-fn-den">' + toHTML(n.right) + '</span></span>';
      case 'pow': {
        const b = n.base;
        if (b.type === 'func' && ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].includes(b.name) && n.exp.type === 'num' && n.exp.value > 0 && Number.isInteger(n.exp.value)) {
          return '<span class="m-fn">' + b.name + '</span><sup>' + n.exp.value + '</sup>(' + toHTML(b.args[0]) + ')';
        }
        return wrapH(b, prec(b) < 5) + '<sup>' + toHTML(n.exp) + '</sup>';
      }
      case 'neg': return '−' + wrapH(n.arg, prec(n.arg) < 2 || isNegLike(n.arg));
      case 'func': {
        const a = n.args.map(toHTML);
        if (n.name === 'abs') return '<span class="m-abs">|' + a[0] + '|</span>';
        if (n.name === 'sqrt') return '√<span class="m-rad">' + a[0] + '</span>';
        if (n.name === 'cbrt') return '∛<span class="m-rad">' + a[0] + '</span>';
        if (n.name === 'log' && n.base) return '<span class="m-fn">log</span><sub>' + toHTML(n.base) + '</sub>(' + a[0] + ')';
        return '<span class="m-fn">' + n.name + '</span>(' + a.join(', ') + ')';
      }
    }
    return '?';
  }
  function wrapH(n, yes) { return yes ? '(' + toHTML(n) + ')' : toHTML(n); }

  function toText(n) {
    switch (n.type) {
      case 'piecewise': return '{' + n.pieces.map((p) => toText(p.ast) + ' if ' + pwCondText(p)).join('; ') + '}';
      case 'num': return FC.numText(n.value);
      case 'var': return 'x';
      case 'param': return n.name;
      case 'const': return n.name;
      case 'add': {
        const pos = splitNeg(n.right);
        if (pos) return toText(n.left) + ' - ' + wrapT(pos, prec(pos) <= 1);
        return toText(n.left) + ' + ' + wrapT(n.right, prec(n.right) < 1);
      }
      case 'sub': {
        const pos = splitNeg(n.right);
        if (pos) return toText(n.left) + ' + ' + wrapT(pos, prec(pos) <= 1);
        return toText(n.left) + ' - ' + wrapT(n.right, prec(n.right) <= 1);
      }
      case 'mul': {
        const rNeg = isNegLike(n.right);
        const L = wrapT(n.left, prec(n.left) < 2);
        const R = wrapT(n.right, prec(n.right) < 2 || rNeg);
        const fa = firstAtom(n.right);
        const lastCh = L[L.length - 1], firstCh = R[0];
        let star = false;
        if (/[0-9.]/.test(firstCh)) star = true;
        if (/[a-z]/.test(lastCh) && fa === 'func') star = true;
        if (n.left.type === 'div' || n.right.type === 'div') star = true;
        if (lastCh === '|' && firstCh === '|') star = true;
        return L + (star ? '*' : '') + R;
      }
      case 'div': {
        const L = wrapT(n.left, prec(n.left) < 2 || n.left.type === 'div');
        const R = wrapT(n.right, prec(n.right) < 4 || n.right.type === 'num' && n.right.value < 0);
        return L + '/' + R;
      }
      case 'pow': {
        const b = n.base;
        const B = wrapT(b, prec(b) < 5 || (b.type === 'num' && b.value < 0));
        const e = n.exp;
        const simple = (e.type === 'num' && e.value >= 0 && Number.isInteger(e.value)) || e.type === 'var' || e.type === 'param' || e.type === 'const';
        return B + '^' + (simple ? toText(e) : '(' + toText(e) + ')');
      }
      case 'neg': return '-' + wrapT(n.arg, prec(n.arg) < 2 || isNegLike(n.arg));
      case 'func': {
        const a = n.args.map(toText);
        if (n.name === 'abs' && !containsType(n.args[0], (m) => m.type === 'func' && m.name === 'abs')) return '|' + a[0] + '|';
        if (n.name === 'log' && n.base) return 'log_(' + toText(n.base) + ')(' + a[0] + ')';
        return n.name + '(' + a.join(', ') + ')';
      }
    }
    return '?';
  }
  function wrapT(n, yes) { return yes ? '(' + toText(n) + ')' : toText(n); }

  // ---------------------------------------------------------------- AST builders & transforms
  const N = {
    num: (v) => ({ type: 'num', value: v }),
    x: () => ({ type: 'var' }),
    add: (a, b) => ({ type: 'add', left: a, right: b }),
    sub: (a, b) => ({ type: 'sub', left: a, right: b }),
    mul: (a, b) => ({ type: 'mul', left: a, right: b }),
    div: (a, b) => ({ type: 'div', left: a, right: b }),
    pow: (a, b) => ({ type: 'pow', base: a, exp: b }),
    neg: (a) => ({ type: 'neg', arg: a }),
    func: (name, a) => ({ type: 'func', name, args: [a] }),
  };
  function clone(n) { return JSON.parse(JSON.stringify(n)); }
  function substitute(n, repl) {
    if (n.type === 'var') return clone(repl);
    if (n.type === 'piecewise') {
      // g(x) = f(m·x + c): lo ≤ m·x + c < hi  ⇔  (lo − c)/m ≤ x < (hi − c)/m  (flipped when m < 0)
      const lin = toPoly(repl, {});
      const t = lin ? poly.trim(lin) : null;
      if (!t || t.length !== 2 || t[1] === 0) throw new Error('Piecewise functions only support linear substitutions');
      const c = t[0], m = t[1];
      const mapB = (b) => {
        if (!b) return null;
        let ast;
        if (collectParams(b.ast).length) ast = simplify(N.div(N.sub(clone(b.ast), N.num(c)), N.num(m)));
        else ast = N.num(Number(((evalConst(b.ast, {}) - c) / m).toPrecision(12)));
        return { ast, incl: b.incl };
      };
      return {
        type: 'piecewise',
        pieces: n.pieces.map((p) => {
          const lo = mapB(p.lo), hi = mapB(p.hi);
          return Object.assign({}, p, { ast: substitute(p.ast, repl), lo: m > 0 ? lo : hi, hi: m > 0 ? hi : lo });
        }).sort((A, B) => (A.lo && B.lo ? evalConst(A.lo.ast, {}) - evalConst(B.lo.ast, {}) : 0)),
      };
    }
    const out = Object.assign({}, n);
    if (n.left) out.left = substitute(n.left, repl);
    if (n.right) out.right = substitute(n.right, repl);
    if (n.arg) out.arg = substitute(n.arg, repl);
    if (n.base) out.base = substitute(n.base, repl);
    if (n.exp) out.exp = substitute(n.exp, repl);
    if (n.args) out.args = n.args.map((a) => substitute(a, repl));
    return out;
  }
  /** Light algebraic clean-up: fold constants, drop ×1 and +0, merge trailing constants. */
  function simplify(n) {
    const s = (m) => simplify(m);
    let out;
    switch (n.type) {
      case 'piecewise': return mapPW(n, s);
      case 'add': case 'sub': case 'mul': case 'div': {
        const L = s(n.left), R = s(n.right);
        // f(x) + 2, 3·f(x), … on a piecewise function → apply to every piece
        if ((L.type === 'piecewise') !== (R.type === 'piecewise')) {
          const pw = L.type === 'piecewise' ? L : R;
          return mapPW(pw, (a) => s({ type: n.type, left: L === pw ? a : clone(L), right: R === pw ? a : clone(R) }));
        }
        if (L.type === 'num' && R.type === 'num') {
          const v = n.type === 'add' ? L.value + R.value : n.type === 'sub' ? L.value - R.value : n.type === 'mul' ? L.value * R.value : L.value / R.value;
          if (isFinite(v) && (n.type !== 'div' || Number.isInteger(v))) return N.num(v);
        }
        if (n.type === 'add' || n.type === 'sub') {
          const sgn = n.type === 'add' ? 1 : -1;
          if (R.type === 'num' && R.value === 0) return L;
          if (L.type === 'num' && L.value === 0) return n.type === 'add' ? R : s(N.neg(R));
          // (A + c1) ± c2  →  A + (c1 ± c2)
          if (R.type === 'num' && (L.type === 'add' || L.type === 'sub') && L.right.type === 'num') {
            const c1 = L.type === 'add' ? L.right.value : -L.right.value;
            const c = c1 + sgn * R.value;
            if (Math.abs(c) < 1e-12) return L.left;
            return c >= 0 ? N.add(L.left, N.num(c)) : N.sub(L.left, N.num(-c));
          }
          if (R.type === 'num' && R.value < 0) return sgn > 0 ? N.sub(L, N.num(-R.value)) : N.add(L, N.num(-R.value));
          return { type: n.type, left: L, right: R };
        }
        if (n.type === 'mul') {
          if (L.type === 'num' && L.value === 1) return R;
          if (R.type === 'num' && R.value === 1) return L;
          if (L.type === 'num' && L.value === -1) return s(N.neg(R));
          if (L.type === 'num' && L.value === 0) return N.num(0);
          // c1·(c2·A) → (c1c2)·A
          if (L.type === 'num' && R.type === 'mul' && R.left.type === 'num') return s(N.mul(N.num(L.value * R.left.value), R.right));
          if (L.type === 'num' && R.type === 'neg') return s(N.mul(N.num(-L.value), R.arg));
          out = { type: 'mul', left: L, right: R };
          if (n.implicit) out.implicit = true;
          return out;
        }
        if (n.type === 'div' && R.type === 'num' && R.value === 1) return L;
        return { type: n.type, left: L, right: R };
      }
      case 'neg': {
        const A = s(n.arg);
        if (A.type === 'piecewise') return mapPW(A, (a) => s(N.neg(a)));
        if (A.type === 'num') return N.num(-A.value);
        if (A.type === 'neg') return A.arg;
        if (A.type === 'mul' && A.left.type === 'num') return N.mul(N.num(-A.left.value), A.right);
        return N.neg(A);
      }
      case 'pow': {
        const B = s(n.base), E = s(n.exp);
        if (B.type === 'piecewise' && E.type !== 'piecewise') return mapPW(B, (a) => s(N.pow(a, clone(E))));
        if (E.type === 'num' && E.value === 1) return B;
        if (E.type === 'num' && E.value === 0) return N.num(1);
        if (B.type === 'num' && E.type === 'num' && Number.isInteger(E.value)) return N.num(Math.pow(B.value, E.value));
        return N.pow(B, E);
      }
      case 'func': {
        const out2 = Object.assign({}, n, { args: n.args.map(s) });
        if (n.base) out2.base = s(n.base);
        if (out2.args.length === 1 && out2.args[0].type === 'piecewise') return mapPW(out2.args[0], (a) => Object.assign({}, out2, { args: [a] }));
        return out2;
      }
      default: return n;
    }
  }

  // ---------------------------------------------------------------- polynomials
  const poly = {
    trim(c) {
      const out = c.slice();
      let mx = 0;
      for (const v of out) mx = Math.max(mx, Math.abs(v));
      while (out.length > 1 && Math.abs(out[out.length - 1]) <= 1e-12 * mx) out.pop();
      if (out.length === 0) out.push(0);
      return out;
    },
    degree(c) { return poly.trim(c).length - 1; },
    add(a, b) { const n = Math.max(a.length, b.length); const o = []; for (let i = 0; i < n; i++) o.push((a[i] || 0) + (b[i] || 0)); return o; },
    sub(a, b) { const n = Math.max(a.length, b.length); const o = []; for (let i = 0; i < n; i++) o.push((a[i] || 0) - (b[i] || 0)); return o; },
    mul(a, b) { const o = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) o[i + j] += a[i] * b[j]; return o; },
    scale(a, k) { return a.map((v) => v * k); },
    eval(c, x) { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * x + c[i]; return r; },
    deriv(c) { const o = []; for (let i = 1; i < c.length; i++) o.push(c[i] * i); return o.length ? o : [0]; },
    /** All complex roots (Aberth–Ehrlich). Returns [{re, im}]. */
    roots(coeffs) {
      let c = poly.trim(coeffs);
      let n = c.length - 1;
      const out = [];
      if (n < 1) return out;
      let mx = 0; for (const v of c) mx = Math.max(mx, Math.abs(v));
      while (n > 0 && Math.abs(c[0]) <= 1e-14 * mx) { out.push({ re: 0, im: 0 }); c = c.slice(1); n--; }
      if (n === 0) return out;
      if (n === 1) { out.push({ re: -c[0] / c[1], im: 0 }); return out; }
      if (n === 2) {
        const [C, B, A] = c;
        const D = B * B - 4 * A * C;
        if (D >= 0) {
          const q = -0.5 * (B + (B >= 0 ? 1 : -1) * Math.sqrt(D));
          const r1 = q / A, r2 = q !== 0 ? C / q : -B / (2 * A);
          out.push({ re: r1, im: 0 }, { re: r2, im: 0 });
        } else {
          const re = -B / (2 * A), im = Math.sqrt(-D) / (2 * Math.abs(A));
          out.push({ re, im }, { re, im: -im });
        }
        return out;
      }
      const a = c.map((v) => v / c[n]);
      const r0 = Math.max(Math.pow(Math.abs(a[0]), 1 / n), 1e-3);
      let R = 0; for (let i = 0; i < n; i++) R = Math.max(R, Math.pow(Math.abs(a[i]), 1 / (n - i)));
      const rad = Math.min(Math.max(r0, 0.5), 2 * R + 1);
      const zr = [], zi = [];
      for (let k = 0; k < n; k++) { const ang = (2 * Math.PI * k) / n + 0.4; zr.push(rad * Math.cos(ang)); zi.push(rad * Math.sin(ang)); }
      for (let it = 0; it < 800; it++) {
        let maxStep = 0;
        for (let k = 0; k < n; k++) {
          // p(z), p'(z) via Horner in complex
          let pr = 1, pi = 0, dr = 0, di = 0;
          const xr = zr[k], xi = zi[k];
          for (let i = n - 1; i >= 0; i--) {
            const ndr = dr * xr - di * xi + pr, ndi = dr * xi + di * xr + pi;
            dr = ndr; di = ndi;
            const npr = pr * xr - pi * xi + a[i], npi = pr * xi + pi * xr;
            pr = npr; pi = npi;
          }
          // ratio = p/p'
          const dd = dr * dr + di * di;
          if (dd === 0) continue;
          const rr = (pr * dr + pi * di) / dd, ri = (pi * dr - pr * di) / dd;
          let sr = 0, si = 0;
          for (let j = 0; j < n; j++) {
            if (j === k) continue;
            const ur = xr - zr[j], ui = xi - zi[j];
            const uu = ur * ur + ui * ui;
            if (uu === 0) continue;
            sr += ur / uu; si -= ui / uu;
          }
          // w = ratio / (1 - ratio*sum)
          const tr = 1 - (rr * sr - ri * si), ti = -(rr * si + ri * sr);
          const tt = tr * tr + ti * ti;
          if (tt === 0) continue;
          const wr = (rr * tr + ri * ti) / tt, wi = (ri * tr - rr * ti) / tt;
          zr[k] -= wr; zi[k] -= wi;
          const step = Math.hypot(wr, wi) / (1 + Math.hypot(zr[k], zi[k]));
          if (step > maxStep) maxStep = step;
        }
        if (maxStep < 1e-15) break;
      }
      for (let k = 0; k < n; k++) out.push({ re: zr[k], im: zi[k] });
      return out;
    },
    /** Real roots with multiplicity: [{x, mult}] sorted, plus complex list. */
    analyzeRoots(coeffs) {
      const c = poly.trim(coeffs);
      const all = poly.roots(c);
      const real = [], complex = [];
      for (const r of all) {
        if (Math.abs(r.im) <= 2e-5 * (1 + Math.abs(r.re))) real.push(r.re);
        else complex.push(r);
      }
      real.sort((p, q) => p - q);
      const clusters = [];
      for (const x of real) {
        const last = clusters[clusters.length - 1];
        if (last && Math.abs(x - last.xs[last.xs.length - 1]) <= 1e-4 * (1 + Math.abs(x))) last.xs.push(x);
        else clusters.push({ xs: [x] });
      }
      const roots = clusters.map((cl) => {
        const m = cl.xs.length;
        let x = cl.xs.reduce((s, v) => s + v, 0) / m;
        // polish on the (m-1)th derivative, where an m-fold root becomes simple
        let q = c;
        for (let i = 1; i < m; i++) q = poly.deriv(q);
        const dq = poly.deriv(q);
        for (let i = 0; i < 30; i++) {
          const fx = poly.eval(q, x), dfx = poly.eval(dq, x);
          if (dfx === 0 || !isFinite(fx)) break;
          const step = fx / dfx;
          if (!isFinite(step) || Math.abs(step) > 0.1 * (1 + Math.abs(x))) break;
          x -= step;
          if (Math.abs(step) < 1e-15 * (1 + Math.abs(x))) break;
        }
        if (Math.abs(x - Math.round(x)) < 1e-9) x = Math.round(x);
        return { x, mult: m };
      });
      const cpx = complex.filter((r) => r.im > 0).sort((p, q) => p.re - q.re);
      return { real: roots, complex: cpx };
    },
    toTerms(c) {
      const t = poly.trim(c);
      const terms = [];
      for (let i = t.length - 1; i >= 0; i--) if (Math.abs(t[i]) > 1e-12) terms.push({ c: t[i], p: i });
      return terms;
    },
    toHTML(c, dp = 4) {
      const terms = poly.toTerms(c);
      if (!terms.length) return '0';
      let s = '';
      terms.forEach((tm, idx) => {
        const neg = tm.c < 0;
        const a = Math.abs(tm.c);
        let coef = FC.fmt(a, dp);
        if (tm.p > 0 && Math.abs(a - 1) < 1e-12) coef = '';
        const xs = tm.p === 0 ? '' : tm.p === 1 ? '<i class="m-x">x</i>' : '<i class="m-x">x</i><sup>' + tm.p + '</sup>';
        const body = (coef === '' && tm.p === 0) ? '1' : coef + xs;
        if (idx === 0) s += (neg ? '−' : '') + body;
        else s += (neg ? ' − ' : ' + ') + body;
      });
      return s;
    },
    toText(c, sig = 6) {
      const terms = poly.toTerms(c);
      if (!terms.length) return '0';
      let s = '';
      terms.forEach((tm, idx) => {
        const neg = tm.c < 0;
        const a = Math.abs(tm.c);
        let coef = FC.numText(a, sig);
        if (tm.p > 0 && Math.abs(a - 1) < 1e-12) coef = '';
        const xs = tm.p === 0 ? '' : tm.p === 1 ? 'x' : 'x^' + tm.p;
        const body = (coef === '' && tm.p === 0) ? '1' : coef + xs;
        if (idx === 0) s += (neg ? '-' : '') + body;
        else s += (neg ? ' - ' : ' + ') + body;
      });
      return s;
    },
    fromRoots(roots, lead = 1) {
      let c = [lead];
      for (const r of roots) c = poly.mul(c, [-r, 1]);
      return c;
    },
  };

  /** Convert an AST into polynomial coefficients (low→high), or null if it isn't a polynomial. */
  function toPoly(n, P) {
    P = P || {};
    switch (n.type) {
      case 'num': return [n.value];
      case 'const': return [CONSTS[n.name]];
      case 'param': return [P[n.name] === undefined ? 1 : P[n.name]];
      case 'var': return [0, 1];
      case 'neg': { const a = toPoly(n.arg, P); return a && poly.scale(a, -1); }
      case 'add': case 'sub': {
        const a = toPoly(n.left, P), b = toPoly(n.right, P);
        if (!a || !b) return null;
        return poly.trim(n.type === 'add' ? poly.add(a, b) : poly.sub(a, b));
      }
      case 'mul': {
        const a = toPoly(n.left, P), b = toPoly(n.right, P);
        if (!a || !b) return null;
        const r = poly.trim(poly.mul(a, b));
        return r.length > 26 ? null : r;
      }
      case 'div': {
        const a = toPoly(n.left, P), b = toPoly(n.right, P);
        if (!a || !b) return null;
        const bt = poly.trim(b);
        if (bt.length === 1 && bt[0] !== 0) return poly.scale(a, 1 / bt[0]);
        return null;
      }
      case 'pow': {
        const b = toPoly(n.base, P);
        if (!b || containsVar(n.exp)) return null;
        const e = evalConst(n.exp, P);
        const bt = poly.trim(b);
        if (bt.length === 1) { const v = Math.pow(bt[0], e); return isFinite(v) ? [v] : null; }
        if (!Number.isInteger(e) || e < 0 || e * (bt.length - 1) > 24) return null;
        let r = [1];
        for (let i = 0; i < e; i++) r = poly.mul(r, bt);
        return poly.trim(r);
      }
      case 'func': {
        if (containsVar(n)) return null;
        const v = evalConst(n, P);
        return isFinite(v) ? [v] : null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- structure detection
  /** Flatten additive terms: returns [{sign, node}]. */
  function addTerms(n, sign = 1, out = []) {
    if (n.type === 'add') { addTerms(n.left, sign, out); addTerms(n.right, sign, out); }
    else if (n.type === 'sub') { addTerms(n.left, sign, out); addTerms(n.right, -sign, out); }
    else if (n.type === 'neg') addTerms(n.arg, -sign, out);
    else out.push({ sign, node: n });
    return out;
  }
  /** Split a product into constant factor × the single x-dependent factor (or null). */
  function constTimes(n, P) {
    if (!containsVar(n)) return { k: evalConst(n, P), core: null };
    if (n.type === 'neg') { const r = constTimes(n.arg, P); return r && { k: -r.k, core: r.core }; }
    if (n.type === 'mul') {
      const L = constTimes(n.left, P), R = constTimes(n.right, P);
      if (!L || !R) return null;
      if (L.core && R.core) return null;
      return { k: L.k * R.k, core: L.core || R.core };
    }
    if (n.type === 'div' && !containsVar(n.right)) {
      const L = constTimes(n.left, P);
      return L && { k: L.k / evalConst(n.right, P), core: L.core };
    }
    return { k: 1, core: n };
  }
  /** Detect  D + A·core  where core is the only x-dependent piece. */
  function outerForm(ast, P) {
    const terms = addTerms(ast);
    let D = 0, core = null, A = 0;
    for (const t of terms) {
      if (!containsVar(t.node)) { D += t.sign * evalConst(t.node, P); continue; }
      if (core) return null;
      const ct = constTimes(t.node, P);
      if (!ct || !ct.core) return null;
      core = ct.core; A = t.sign * ct.k;
    }
    if (!core) return null;
    return { A, D, core };
  }
  function linearArg(n, P) {
    const p = toPoly(n, P);
    if (!p) return null;
    const t = poly.trim(p);
    if (t.length !== 2) return null;
    return { B: t[1], C: t[0] };
  }
  function sinusoid(ast, P) {
    const o = outerForm(ast, P);
    if (!o || o.core.type !== 'func' || !['sin', 'cos'].includes(o.core.name)) return null;
    const lin = linearArg(o.core.args[0], P);
    if (!lin) return null;
    return { fn: o.core.name, A: o.A, B: lin.B, C: lin.C, D: o.D, amplitude: Math.abs(o.A), period: 2 * Math.PI / Math.abs(lin.B), midline: o.D, phaseShift: -lin.C / lin.B };
  }
  function absForm(ast, P) {
    const o = outerForm(ast, P);
    if (!o || o.core.type !== 'func' || o.core.name !== 'abs') return null;
    const lin = linearArg(o.core.args[0], P);
    if (!lin) return null;
    return { A: o.A, h: -lin.C / lin.B, k: o.D, slope: Math.abs(o.A * lin.B) };
  }
  function expForm(ast, P) {
    const o = outerForm(ast, P);
    if (!o) return null;
    const c = o.core;
    let base = null, lin = null;
    if (c.type === 'func' && c.name === 'exp') { lin = linearArg(c.args[0], P); base = Math.E; }
    else if (c.type === 'pow' && !containsVar(c.base) && containsVar(c.exp)) { base = evalConst(c.base, P); lin = linearArg(c.exp, P); }
    if (!lin || !(base > 0) || base === 1) return null;
    const factor = Math.pow(base, lin.B);
    const initial = o.A * Math.pow(base, lin.C);
    return { A: o.A, D: o.D, base, B: lin.B, C: lin.C, factor, initial, growth: factor > 1 };
  }

  function classify(ast, P, coeffs) {
    if (ast && ast.type === 'piecewise') {
      const n = ast.pieces.length;
      return { family: 'piecewise', name: 'piecewise', label: 'Piecewise · ' + n + (n === 1 ? ' piece' : ' pieces'), pieceFamilies: ast.pieces.map((p) => classify(p.ast, P, toPoly(p.ast, P))) };
    }
    if (coeffs) {
      const d = poly.degree(coeffs);
      const names = ['constant', 'linear', 'quadratic', 'cubic', 'quartic', 'quintic'];
      return { family: 'polynomial', degree: d, name: d < names.length ? names[d] : 'degree-' + d + ' polynomial', label: (d < names.length ? names[d][0].toUpperCase() + names[d].slice(1) : 'Degree-' + d) + (d >= 2 ? ' polynomial' : d === 1 ? ' function' : ' function') };
    }
    const flags = new Set();
    walk(ast, (n) => {
      if (n.type === 'func' && containsVar(n)) {
        if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].includes(n.name)) flags.add('trig');
        else if (['asin', 'acos', 'atan'].includes(n.name)) flags.add('invtrig');
        else if (n.name === 'exp') flags.add('exp');
        else if (n.name === 'ln' || n.name === 'log') flags.add('log');
        else if (n.name === 'sqrt' || n.name === 'cbrt') flags.add('root');
        else if (n.name === 'abs') flags.add('abs');
        else if (['floor', 'ceil', 'round', 'sign'].includes(n.name)) flags.add('step');
        else if (['sinh', 'cosh', 'tanh'].includes(n.name)) flags.add('hyp');
        else if (n.name === 'min' || n.name === 'max') flags.add('piecewise');
      }
      if (n.type === 'pow' && containsVar(n.exp)) flags.add('exp');
      if (n.type === 'pow' && containsVar(n.base) && !containsVar(n.exp)) {
        const e = evalConst(n.exp, P);
        if (!Number.isInteger(e)) flags.add('root');
        else if (e < 0) flags.add('rational');
      }
      if (n.type === 'div' && containsVar(n.right)) flags.add('rational');
    });
    const order = [['trig', 'Trigonometric (wave)'], ['exp', 'Exponential'], ['log', 'Logarithmic'], ['root', 'Radical (square root)'], ['abs', 'Absolute value'], ['rational', 'Rational'], ['step', 'Step'], ['invtrig', 'Inverse trig'], ['hyp', 'Hyperbolic'], ['piecewise', 'Piecewise']];
    const found = order.filter(([k]) => flags.has(k));
    if (!found.length) return { family: 'other', name: 'function', label: 'Function', flags: [] };
    const fam = found[0][0];
    const label = found.length > 1 ? found[0][1] + ' mix' : found[0][1];
    let name = { trig: 'trigonometric', exp: 'exponential', log: 'logarithmic', root: 'radical', abs: 'absolute value', rational: 'rational', step: 'step', invtrig: 'inverse trig', hyp: 'hyperbolic', piecewise: 'piecewise' }[fam];
    if (fam === 'trig' && sinusoid(ast, P)) name = 'sinusoidal';
    return { family: fam, name, label: fam === 'trig' && sinusoid(ast, P) ? 'Sinusoidal (wave)' : label, flags: Array.from(flags) };
  }

  return {
    parse, compile, evalConst, evalConstExpr, toHTML, toText, toPoly, poly, classify, sinusoid, absForm, expForm,
    containsVar, collectParams, substitute, simplify, clone, N, normalize, walk, CONSTS,
    parseSingle, parseCondition, compilePW, pwCondText, pwCondHTML, isPW: (ast) => !!ast && ast.type === 'piecewise',
  };
})();
if (typeof module !== 'undefined') module.exports = FCMath;
