import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const nodeBinary = existsSync(process.execPath) ? process.execPath : "node";

const processes: ChildProcess[] = [];

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("mock proxy did not become healthy in time");
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) return;

  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
}

async function startMockProxy(overrides: Record<string, string> = {}): Promise<{
  process: ChildProcess;
  port: number;
}> {
  const port = 46000 + Math.floor(Math.random() * 1000);
  const child = spawn(nodeBinary, ["./scripts/mock-llm-proxy.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  processes.push(child);
  child.stderr?.resume();
  child.stdout?.resume();

  await waitForHealth(port);
  return { process: child, port };
}

afterEach(async () => {
  while (processes.length > 0) {
    const child = processes.pop();
    if (!child) continue;
    await stopProcess(child);
  }
}, 15000);

describe("mock LLM proxy", () => {
  it("serves health and chat completions endpoints for manual testing", async () => {
    const { port } = await startMockProxy();

    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "copilot",
        stream: false,
        messages: [
          { role: "system", content: "Analyze Teams captions" },
          {
            role: "user",
            content:
              "Title: Demo\nPrompt: Summarize key points.\n\nCaptions:\n- 10:00 | Alice: Ship it",
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: expect.stringContaining("Mock summary"),
          },
          finish_reason: "stop",
        },
      ],
    });
  }, 15000);

  it("can require a bearer token to exercise secure settings flow manually", async () => {
    const { port } = await startMockProxy({ MOCK_BEARER_TOKEN: "secret-demo-token" });

    const denied = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "copilot", stream: false, messages: [] }),
    });
    expect(denied.status).toBe(401);

    const allowed = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-demo-token",
      },
      body: JSON.stringify({ model: "copilot", stream: false, messages: [] }),
    });

    expect(allowed.status).toBe(200);
  }, 15000);
});
