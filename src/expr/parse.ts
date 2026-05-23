/**
 * Recursive-descent parser for the tiny safe expression language.
 *
 * No external dependencies, no eval, no codegen. Returns an AST. Throws
 * ParseError on syntactic failures.
 */

import type {
  BinExpr,
  BinOp,
  CallExpr,
  Expr,
  FieldExpr,
  LitExpr,
  NegExpr,
  NotExpr,
} from "./types.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(`expr: ${message} (at position ${position})`);
    this.name = "ParseError";
  }
}

// --- Tokenizer ---

type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "string"; value: string; pos: number }
  | { kind: "ident"; value: string; pos: number }
  | { kind: "keyword"; value: "and" | "or" | "not" | "true" | "false" | "null"; pos: number }
  | { kind: "punct"; value: string; pos: number }
  | { kind: "op"; value: BinOp | "-"; pos: number }
  | { kind: "eof"; pos: number };

const KEYWORDS = new Set(["and", "or", "not", "true", "false", "null"]);

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      let j = i;
      while (j < source.length && /[\d.]/.test(source[j]!)) j++;
      const lex = source.slice(i, j);
      const value = Number(lex);
      if (Number.isNaN(value)) {
        throw new ParseError(`invalid number "${lex}"`, i);
      }
      out.push({ kind: "number", value, pos: i });
      i = j;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\" && j + 1 < source.length) {
          const next = source[j + 1]!;
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          j += 2;
        } else {
          value += source[j];
          j++;
        }
      }
      if (j >= source.length) {
        throw new ParseError("unterminated string", i);
      }
      out.push({ kind: "string", value, pos: i });
      i = j + 1;
      continue;
    }

    // Identifiers + keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j]!)) j++;
      const lex = source.slice(i, j);
      if (KEYWORDS.has(lex)) {
        out.push({
          kind: "keyword",
          value: lex as Extract<Token, { kind: "keyword" }>["value"],
          pos: i,
        });
      } else {
        out.push({ kind: "ident", value: lex, pos: i });
      }
      i = j;
      continue;
    }

    // Two-char operators
    const two = source.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
      out.push({ kind: "op", value: two as BinOp, pos: i });
      i += 2;
      continue;
    }

    // Single-char operators + punctuation
    if (ch === "<" || ch === ">" || ch === "+" || ch === "*" || ch === "/" || ch === "%") {
      out.push({ kind: "op", value: ch as BinOp, pos: i });
      i++;
      continue;
    }
    if (ch === "-") {
      // Ambiguous: subtraction OR unary negation. Emit as "op", parser disambiguates.
      out.push({ kind: "op", value: "-", pos: i });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "," || ch === ".") {
      out.push({ kind: "punct", value: ch, pos: i });
      i++;
      continue;
    }

    throw new ParseError(`unexpected character "${ch}"`, i);
  }

  out.push({ kind: "eof", pos: source.length });
  return out;
}

// --- Parser ---

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw new ParseError(`unexpected token after expression`, this.peek().pos);
    }
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private consume(): Token {
    return this.tokens[this.pos++]!;
  }
  private matchKeyword(kw: string): boolean {
    const t = this.peek();
    if (t.kind === "keyword" && t.value === kw) {
      this.consume();
      return true;
    }
    return false;
  }
  private matchOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t.kind === "op" && ops.includes(t.value)) {
      this.consume();
      return t.value;
    }
    return null;
  }
  private matchPunct(c: string): boolean {
    const t = this.peek();
    if (t.kind === "punct" && t.value === c) {
      this.consume();
      return true;
    }
    return false;
  }
  private expectPunct(c: string): void {
    if (!this.matchPunct(c)) {
      throw new ParseError(`expected "${c}"`, this.peek().pos);
    }
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.matchKeyword("or")) {
      const right = this.parseAnd();
      left = { kind: "bin", op: "or", left, right } satisfies BinExpr;
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.matchKeyword("and")) {
      const right = this.parseNot();
      left = { kind: "bin", op: "and", left, right } satisfies BinExpr;
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.matchKeyword("not")) {
      const expr = this.parseNot();
      return { kind: "not", expr } satisfies NotExpr;
    }
    return this.parseCmp();
  }

  private parseCmp(): Expr {
    const left = this.parseAdd();
    const op = this.matchOp("==", "!=", "<", "<=", ">", ">=");
    if (op === null) return left;
    const right = this.parseAdd();
    return { kind: "bin", op: op as BinOp, left, right } satisfies BinExpr;
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    let op = this.matchOp("+", "-");
    while (op !== null) {
      const right = this.parseMul();
      left = { kind: "bin", op: op as BinOp, left, right } satisfies BinExpr;
      op = this.matchOp("+", "-");
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parseUnary();
    let op = this.matchOp("*", "/", "%");
    while (op !== null) {
      const right = this.parseUnary();
      left = { kind: "bin", op: op as BinOp, left, right } satisfies BinExpr;
      op = this.matchOp("*", "/", "%");
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.matchOp("-")) {
      const expr = this.parseUnary();
      return { kind: "neg", expr } satisfies NegExpr;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.kind === "number") {
      this.consume();
      return { kind: "lit", value: t.value } satisfies LitExpr;
    }
    if (t.kind === "string") {
      this.consume();
      return { kind: "lit", value: t.value } satisfies LitExpr;
    }
    if (t.kind === "keyword") {
      if (t.value === "true" || t.value === "false") {
        this.consume();
        return { kind: "lit", value: t.value === "true" } satisfies LitExpr;
      }
      if (t.value === "null") {
        this.consume();
        return { kind: "lit", value: null } satisfies LitExpr;
      }
      throw new ParseError(`unexpected keyword "${t.value}"`, t.pos);
    }
    if (t.kind === "punct" && t.value === "(") {
      this.consume();
      const expr = this.parseOr();
      this.expectPunct(")");
      return expr;
    }
    if (t.kind === "ident") {
      this.consume();
      // funcCall?
      if (this.peek().kind === "punct" && (this.peek() as { value: string }).value === "(") {
        this.consume();
        const args: Expr[] = [];
        if (!(this.peek().kind === "punct" && (this.peek() as { value: string }).value === ")")) {
          args.push(this.parseOr());
          while (this.matchPunct(",")) {
            args.push(this.parseOr());
          }
        }
        this.expectPunct(")");
        return { kind: "call", name: t.value, args } satisfies CallExpr;
      }
      // fieldRef
      const path = [t.value];
      while (this.matchPunct(".")) {
        const next = this.peek();
        if (next.kind !== "ident") {
          throw new ParseError(`expected identifier after "."`, next.pos);
        }
        path.push(next.value);
        this.consume();
      }
      return { kind: "field", path } satisfies FieldExpr;
    }

    throw new ParseError(`unexpected token`, t.pos);
  }
}

export function parseExpression(source: string): Expr {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}
