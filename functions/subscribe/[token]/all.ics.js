import { icsResponse, validSubscriptionToken } from "../../_lib/subscriptions.js";

export async function onRequestGet(context) {
  if (!validSubscriptionToken(context.params.token, context.env)) return new Response("Not found", { status: 404 });
  const url = new URL(context.request.url);
  const body = await icsResponse(context.env, {
    categoryId: url.searchParams.get("category"),
    subjectId: url.searchParams.get("subject"),
  });
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=ai0506-calendar.ics",
      "Cache-Control": "private, max-age=300, must-revalidate",
    },
  });
}
