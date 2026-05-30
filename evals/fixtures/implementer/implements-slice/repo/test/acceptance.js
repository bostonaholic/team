// Planted acceptance test for the "sum reducer" slice. Currently FAILS until
// src/sum.js is implemented. The implementer must NOT modify this file.
const assert = require("node:assert");
const { sum } = require("../src/sum.js");

assert.strictEqual(sum([1, 2, 3]), 6, "sum([1,2,3]) should be 6");
assert.strictEqual(sum([]), 0, "sum([]) should be 0");

console.log("ok - sum reducer");
