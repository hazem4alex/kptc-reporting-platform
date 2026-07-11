import test from "node:test";
import assert from "node:assert/strict";
import { formatFareKwd } from "../src/utils.js";

test("formats integer fils as three-decimal KWD", () => {
  assert.equal(formatFareKwd(250), "0.250");
  assert.equal(formatFareKwd(0), "0.000");
  assert.equal(formatFareKwd(1250), "1.250");
});

test("rejects decimal, negative and missing fare values", () => {
  assert.equal(formatFareKwd(0.25), null);
  assert.equal(formatFareKwd(-1), null);
  assert.equal(formatFareKwd(undefined), null);
});
