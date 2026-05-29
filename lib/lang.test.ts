import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectLang } from "./lang.ts";

describe("detectLang", () => {
  test("empty or whitespace-only input is plaintext", () => {
    assert.equal(detectLang(""), "plaintext");
    assert.equal(detectLang("   \n\t  "), "plaintext");
  });

  test("TypeScript via type annotations, interface, type alias, import type", () => {
    assert.equal(
      detectLang("function f(x: number): string { return ''; }"),
      "typescript",
    );
    assert.equal(detectLang("interface Foo { a: number }"), "typescript");
    assert.equal(detectLang("type T = string;"), "typescript");
    assert.equal(
      detectLang('import type { User } from "./types";'),
      "typescript",
    );
  });

  test("Python via def, from-import, print", () => {
    assert.equal(detectLang("def foo(x):\n    return x"), "python");
    assert.equal(detectLang("from os import path"), "python");
    assert.equal(detectLang("print('hi')"), "python");
  });

  test("Rust via fn, let mut, path separator", () => {
    assert.equal(detectLang("fn main() {}"), "rust");
    assert.equal(detectLang("let mut count = 0;"), "rust");
  });

  test("Go via package main and func", () => {
    assert.equal(detectLang("package main\nfunc main() {}"), "go");
  });

  test("JavaScript via declarations and arrow functions", () => {
    assert.equal(detectLang("const x = 5;"), "javascript");
    assert.equal(detectLang("const f = () => { return 1; };"), "javascript");
  });

  test("prose falls back to plaintext", () => {
    assert.equal(
      detectLang("the quick brown fox jumps over the lazy dog"),
      "plaintext",
    );
  });
});
