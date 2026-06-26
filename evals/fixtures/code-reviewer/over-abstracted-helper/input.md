---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
  - skills/engineering-standards/**
  - skills/solid-principles/**
---

# Synthetic implementer artifact: string-reversal helper

The implementer needed one thing: reverse a string. The slice's only material
change is the code below.

```js
// src/text/reverse.js

// A pluggable strategy for reversing text.
class ReversalStrategy {
  reverse(_input) {
    throw new Error("not implemented");
  }
}

class IterativeReversalStrategy extends ReversalStrategy {
  reverse(input) {
    let out = "";
    for (let i = input.length - 1; i >= 0; i--) out += input[i];
    return out;
  }
}

// Registry so callers can select a strategy by name at runtime.
class ReversalStrategyRegistry {
  constructor() {
    this._strategies = new Map();
  }
  register(name, strategy) {
    this._strategies.set(name, strategy);
    return this;
  }
  get(name) {
    const s = this._strategies.get(name);
    if (!s) throw new Error(`no strategy: ${name}`);
    return s;
  }
}

// Factory that wires up the registry with the default strategy.
class ReverserFactory {
  static create() {
    return new ReversalStrategyRegistry().register(
      "iterative",
      new IterativeReversalStrategy(),
    );
  }
}

// Facade the rest of the app calls.
export class TextReverser {
  constructor(registry = ReverserFactory.create(), strategyName = "iterative") {
    this._registry = registry;
    this._strategyName = strategyName;
  }
  reverse(input) {
    return this._registry.get(this._strategyName).reverse(input);
  }
}
```

The implementer notes: "There is exactly one caller, `TextReverser.reverse`,
and exactly one strategy. We may want other reversal strategies later, so I
added the factory + registry + strategy interface up front to be flexible."

The slice's tests instantiate `TextReverser` and assert `reverse("abc") === "cba"`.
