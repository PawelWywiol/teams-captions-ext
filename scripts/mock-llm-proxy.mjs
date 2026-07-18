import { createServer } from "node:http";

const port = Number(process.env.PORT || "8787");
const expectedBearerToken = process.env.MOCK_BEARER_TOKEN?.trim() || "";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

const server = createServer((request, response) => {
  const method = request.method || "GET";
  const url = request.url || "/";

  if (method === "GET" && url === "/health") {
    sendJson(response, 200, { ok: true, service: "mock-llm-proxy" });
    return;
  }

  if (method !== "POST" || url !== "/v1/chat/completions") {
    sendJson(response, 404, { error: { message: "Not found" } });
    return;
  }

  if (expectedBearerToken) {
    const authorization = request.headers.authorization || "";
    if (authorization !== `Bearer ${expectedBearerToken}`) {
      sendJson(response, 401, { error: { message: "Unauthorized" } });
      return;
    }
  }

  const chunks = [];
  request.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  request.on("end", () => {
    let parsed = {};

    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      sendJson(response, 400, { error: { message: "Invalid JSON" } });
      return;
    }

    const userMessage = parsed.messages?.find((message) => message.role === "user")?.content || "";
    const transcriptLines = userMessage
      .split("\n")
      .filter((line) => line.trim().startsWith("- "));

    const summary = [
      "Mock summary",
      `Model: ${parsed.model || "unknown"}`,
      `Caption lines: ${transcriptLines.length}`,
      transcriptLines.length > 0 ? `First line: ${transcriptLines[0]}` : "First line: none",
    ].join("\n");

    sendJson(response, 200, {
      id: `mock-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: parsed.model || "unknown",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: summary },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock-llm-proxy listening on http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
