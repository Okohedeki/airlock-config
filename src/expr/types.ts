/**
 * AST types for the tiny safe expression language used in `when` clauses.
 *
 * Grammar:
 *   expr      = orExpr
 *   orExpr    = andExpr ('or' andExpr)*
 *   andExpr   = notExpr ('and' notExpr)*
 *   notExpr   = 'not' notExpr | cmpExpr
 *   cmpExpr   = addExpr (cmpOp addExpr)?    # at most one comparison
 *   cmpOp     = '==' | '!=' | '<' | '<=' | '>' | '>='
 *   addExpr   = mulExpr (('+'|'-') mulExpr)*
 *   mulExpr   = unaryExpr (('*'|'/'|'%') unaryExpr)*
 *   unaryExpr = '-' unaryExpr | primary
 *   primary   = literal | fieldRef | funcCall | '(' expr ')'
 *   literal   = number | string | 'true' | 'false' | 'null'
 *   fieldRef  = ident ('.' ident)*
 *   funcCall  = ident '(' (expr (',' expr)*)? ')'
 */

export type Expr =
  | LitExpr
  | FieldExpr
  | CallExpr
  | NegExpr
  | NotExpr
  | BinExpr;

export type LitExpr = {
  kind: "lit";
  value: number | string | boolean | null;
};

export type FieldExpr = {
  kind: "field";
  /** Dotted path, e.g. ["input", "po", "amount"]. First segment is the root binding. */
  path: string[];
};

export type CallExpr = {
  kind: "call";
  name: string;
  args: Expr[];
};

export type NegExpr = { kind: "neg"; expr: Expr };
export type NotExpr = { kind: "not"; expr: Expr };

export type BinExpr = {
  kind: "bin";
  op: BinOp;
  left: Expr;
  right: Expr;
};

export type BinOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "and"
  | "or";
