import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/api/hello",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const bodyText = await req.text();
    return new Response(bodyText + "there", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }),
});

http.route({
  path: "/api/messages/*",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return new Response(null, {
      status: 200,
    });
  }),
});

export default http;
