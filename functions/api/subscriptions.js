import { error, ok } from "../_lib/response.js";
import { subscriptionCategories, subscriptionSubjects, subscriptionTokenConfigured, subscriptionUrls } from "../_lib/subscriptions.js";

// Returns private feed URLs only after the normal /api authentication succeeds.
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!subscriptionTokenConfigured(env)) {
    return error("not_configured", "Calendar subscriptions are not configured", 503);
  }
  const categories = await subscriptionCategories(env);
  const subjects = await subscriptionSubjects(env);
  const urls = subscriptionUrls(new URL(request.url).origin, env.ICS_SUBSCRIPTION_TOKEN, categories, subjects);
  return ok(urls);
}
