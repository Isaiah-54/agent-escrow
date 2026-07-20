import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../mcpTools";

// This app previously had no "test" script at all â€” `npm test` would fail
// with "Missing script: test" before any code even ran. These are real
// regression tests against the MCP tool declarations actually served by
// GET /api/mcp and consumed by tools/list â€” not placeholders.

test("TOOLS is a non-empty array", () => {
  assert.ok(Array.isArray(TOOLS));
  assert.ok(TOOLS.length > 0);
});

test("every tool has a unique name", () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "tool names must be unique");
});

test("every tool declares a valid JSON Schema input shape", () => {
  for (const tool of TOOLS) {
    assert.equal(typeof tool.name, "string");
    assert.ok(tool.name.length > 0);
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 0, `${tool.name} needs a non-empty description`);

    assert.equal(tool.inputSchema.type, "object");
    assert.ok(
      tool.inputSchema.properties && typeof tool.inputSchema.properties === "object",
      `${tool.name}.inputSchema.properties must be an object`
    );
    assert.ok(Array.isArray(tool.inputSchema.required), `${tool.name}.inputSchema.required must be an array`);

    // Every field marked required must actually be declared in properties.
    for (const req of tool.inputSchema.required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(tool.inputSchema.properties, req),
        `${tool.name}: required field "${req}" is not declared in properties`
      );
    }
  }
});

test("fund_escrow_task and ai_verification_settlement are both present", () => {
  const names = TOOLS.map((t) => t.name);
  assert.ok(names.includes("fund_escrow_task"));
  assert.ok(names.includes("ai_verification_settlement"));
});
