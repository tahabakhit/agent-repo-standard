/**
 * Tests for bootstrap helpers.
 *
 * Pure function tests — no Pi runtime required.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getBootstrapContent,
  messageContainsBootstrap,
  messagesContainBootstrap,
  findBootstrapInsertionIndex,
} from "../src/bootstrap.ts";

// ── getBootstrapContent ────────────────────────────────────────────────────

test("getBootstrapContent: is a non-empty string", () => {
  const content = getBootstrapContent();
  assert.equal(typeof content, "string");
  assert.ok(content.length > 0);
});

test("getBootstrapContent: is short (under 200 chars)", () => {
  const content = getBootstrapContent();
  assert.ok(
    content.length < 200,
    `Bootstrap content is too long (${content.length} chars): ${content}`,
  );
});

test("getBootstrapContent: contains the bootstrap marker", () => {
  const content = getBootstrapContent();
  // The marker must be detectable by messageContainsBootstrap
  assert.equal(messageContainsBootstrap(content), true);
});

test("getBootstrapContent: does not contain Mogador specifics or hostnames", () => {
  const content = getBootstrapContent().toLowerCase();
  // Portability: no estate specifics should leak into the bootstrap
  assert.ok(!content.includes("mogador"));
  assert.ok(!content.includes("igoudar"));
  assert.ok(!content.includes("anzar"));
});

// ── messageContainsBootstrap ───────────────────────────────────────────────

test("messageContainsBootstrap: returns true for content containing the marker", () => {
  assert.equal(messageContainsBootstrap(getBootstrapContent()), true);
});

test("messageContainsBootstrap: returns false for unrelated text", () => {
  assert.equal(messageContainsBootstrap("hello world"), false);
  assert.equal(messageContainsBootstrap(""), false);
});

// ── messagesContainBootstrap ───────────────────────────────────────────────

test("messagesContainBootstrap: returns false for empty message array", () => {
  assert.equal(messagesContainBootstrap([]), false);
});

test("messagesContainBootstrap: returns false when no message has bootstrap", () => {
  const messages = [
    { role: "user", content: "Do something" },
    { role: "assistant", content: "Sure!" },
  ];
  assert.equal(messagesContainBootstrap(messages), false);
});

test("messagesContainBootstrap: returns true when a string message contains bootstrap", () => {
  const messages = [
    { role: "system", content: getBootstrapContent() },
    { role: "user", content: "Do something" },
  ];
  assert.equal(messagesContainBootstrap(messages), true);
});

test("messagesContainBootstrap: detects bootstrap in multi-part content array", () => {
  const messages = [
    {
      role: "system",
      content: [{ type: "text", text: getBootstrapContent() }],
    },
    { role: "user", content: "Hello" },
  ];
  assert.equal(messagesContainBootstrap(messages), true);
});

test("messagesContainBootstrap: skips non-string, non-array content gracefully", () => {
  const messages = [
    { role: "tool", content: { nested: "object" } },
    { role: "user", content: 42 },
  ];
  // Should not throw, should return false
  assert.equal(messagesContainBootstrap(messages), false);
});

// ── findBootstrapInsertionIndex ────────────────────────────────────────────

test("findBootstrapInsertionIndex: returns 0 for empty array", () => {
  assert.equal(findBootstrapInsertionIndex([]), 0);
});

test("findBootstrapInsertionIndex: returns 0 when no system message present", () => {
  const messages = [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hello" },
  ];
  assert.equal(findBootstrapInsertionIndex(messages), 0);
});

test("findBootstrapInsertionIndex: returns 1 after single system message", () => {
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hi" },
  ];
  assert.equal(findBootstrapInsertionIndex(messages), 1);
});

test("findBootstrapInsertionIndex: returns after last system message", () => {
  const messages = [
    { role: "system", content: "System prompt A." },
    { role: "system", content: "System prompt B." },
    { role: "user", content: "Hi" },
  ];
  assert.equal(findBootstrapInsertionIndex(messages), 2);
});

test("findBootstrapInsertionIndex: handles system message at end of array", () => {
  const messages = [
    { role: "user", content: "Hi" },
    { role: "system", content: "Late system message." },
  ];
  assert.equal(findBootstrapInsertionIndex(messages), 2);
});
