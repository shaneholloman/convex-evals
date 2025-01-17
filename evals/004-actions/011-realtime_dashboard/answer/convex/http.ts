import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Dashboard configuration
const DASHBOARD_CONFIG = {
  heartbeatInterval: 30 * 1000, // 30 seconds
  metricWindow: 3600, // 1 hour
  alertThresholds: {
    cpu_usage: 90,
    memory_usage: 85,
    error_rate: 5,
    latency: 1000,
  },
};

// Helper to format SSE data
function formatSSE(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Helper to get latest metrics
async function getLatestMetrics(ctx: any) {
  const cutoff = Date.now() - DASHBOARD_CONFIG.metricWindow * 1000;
  const metrics = await ctx.runQuery(api.queries.getMetrics, { since: cutoff });
  return metrics;
}

// Helper to get active alerts
async function getActiveAlerts(ctx: any) {
  const alerts = await ctx.runQuery(api.queries.getActiveAlerts);
  return alerts;
}

// Helper to get system status
async function getSystemStatus(ctx: any) {
  const status = await ctx.runQuery(api.queries.getSystemStatus);
  return status;
}

export const dashboard = httpAction(async (ctx, request) => {
  // Only handle GET requests
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Set headers for SSE
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Send initial data
  const initialData = {
    metrics: await getLatestMetrics(ctx),
    alerts: await getActiveAlerts(ctx),
    systemStatus: await getSystemStatus(ctx),
  };
  await writer.write(formatSSE("init", initialData));

  // Set up heartbeat
  const heartbeatInterval = setInterval(async () => {
    await writer.write(formatSSE("heartbeat", { timestamp: Date.now() }));
  }, DASHBOARD_CONFIG.heartbeatInterval);

  // Set up metric updates
  const metricInterval = setInterval(async () => {
    const metrics = await getLatestMetrics(ctx);
    await writer.write(formatSSE("metrics", { metrics }));
  }, 5000); // Update metrics every 5 seconds

  // Set up alert and status updates
  const statusInterval = setInterval(async () => {
    const [alerts, systemStatus] = await Promise.all([
      getActiveAlerts(ctx),
      getSystemStatus(ctx),
    ]);
    await writer.write(formatSSE("alerts", { alerts }));
    await writer.write(formatSSE("status", { systemStatus }));
  }, 10000); // Update alerts and status every 10 seconds

  // Clean up on connection close
  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeatInterval);
    clearInterval(metricInterval);
    clearInterval(statusInterval);
    writer.close();
  });

  return new Response(stream.readable, { headers });
}); 