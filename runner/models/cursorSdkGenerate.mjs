import { Agent } from "@cursor/sdk";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const {
  runnableName,
  formattedName,
  systemContent,
  userPrompt,
} = input;

const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model: { id: runnableName },
  name: `convex-evals ${formattedName}`,
  mcpServers: {},
});

const requestStartedAt = Date.now();
let timeToFirstTokenMs;
let sawToolCall = false;
let advertisedTools = [];
const assistantText = [];

try {
  const run = await agent.send(
    [
      systemContent,
      "",
      "You are being evaluated as a one-shot model call.",
      "Do not call tools, inspect files, edit files, run commands, or use any agent capabilities.",
      "Return only the requested markdown response.",
      "",
      userPrompt,
    ].join("\n"),
    { mcpServers: {} },
  );

  if (run.supports("stream")) {
    for await (const event of run.stream()) {
      if (event.type === "system" && Array.isArray(event.tools)) {
        advertisedTools = event.tools;
      }
      if (event.type === "tool_call") {
        sawToolCall = true;
      }
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type !== "text") {
            sawToolCall = true;
            continue;
          }
          if (block.text.length > 0 && timeToFirstTokenMs === undefined) {
            timeToFirstTokenMs = Date.now() - requestStartedAt;
          }
          assistantText.push(block.text);
        }
      }
    }
  }

  const result = await run.wait();
  const text = assistantText.join("") || result.result || "";
  process.stdout.write(
    JSON.stringify({
      text,
      sawToolCall,
      advertisedTools,
      timeToFirstTokenMs,
    }),
  );
} finally {
  agent.close();
}
