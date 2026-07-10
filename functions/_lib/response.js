// 统一 JSON 响应信封
//   成功: { ok: true,  data: <payload> }
//   失败: { ok: false, error: { code, message } }

/**
 * 返回 JSON 响应。
 * @param {object} body   响应体对象
 * @param {number} status HTTP 状态码
 * @param {object} [headers] 额外响应头（如 Set-Cookie）
 */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** 成功响应 */
export function ok(data, status = 200, headers = {}) {
  return json({ ok: true, data }, status, headers);
}

/** 失败响应 */
export function error(code, message, status = 400, headers = {}) {
  return json({ ok: false, error: { code, message } }, status, headers);
}
