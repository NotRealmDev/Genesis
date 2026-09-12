/**
 * Genesis Proxy Worker
 *
 * Deploy this file as a Cloudflare Worker.
 *
 * Features:
 * - Proxies normal public http/https pages.
 * - Blocks localhost, private IP ranges, link-local, and obvious internal names.
 * - Does NOT forward cookies, Authorization, or other browser credentials.
 * - GET / HEAD only.
 * - Rewrites common HTML links/resources back through the proxy.
 *
 * This is a basic web compatibility proxy. Complex sites that depend heavily
 * on service workers, WebSockets, strict origin checks, or advanced JS routing
 * may still not work perfectly.
 */

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

function isIPv4(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function privateIPv4(host) {
  if (!isIPv4(host)) return false;
  const p = host.split(".").map(Number);
  if (p.some(n => n < 0 || n > 255)) return true;

  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19))
  );
}

function blockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan")
  ) return true;

  if (privateIPv4(h)) return true;

  // Basic IPv6 local/private/link-local blocks.
  if (h.includes(":")) {
    const n = h.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      n === "::1" ||
      n === "::" ||
      n.startsWith("fc") ||
      n.startsWith("fd") ||
      n.startsWith("fe8") ||
      n.startsWith("fe9") ||
      n.startsWith("fea") ||
      n.startsWith("feb")
    ) return true;
  }

  return false;
}

function safeTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  if (blockedHost(url.hostname)) {
    throw new Error("Private/local network destinations are not allowed");
  }

  return url;
}

function proxied(proxyOrigin, absoluteUrl) {
  return `${proxyOrigin}/?url=${encodeURIComponent(absoluteUrl)}`;
}

function resolveAndProxy(proxyOrigin, baseUrl, value) {
  if (!value) return value;
  const v = value.trim();

  if (
    v.startsWith("#") ||
    /^data:/i.test(v) ||
    /^blob:/i.test(v) ||
    /^javascript:/i.test(v) ||
    /^mailto:/i.test(v) ||
    /^tel:/i.test(v)
  ) return value;

  try {
    const absolute = new URL(v, baseUrl).href;
    const u = safeTarget(absolute);
    return proxied(proxyOrigin, u.href);
  } catch {
    return value;
  }
}

function rewriteSrcset(proxyOrigin, baseUrl, srcset) {
  if (!srcset) return srcset;
  return srcset
    .split(",")
    .map(part => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      bits[0] = resolveAndProxy(proxyOrigin, baseUrl, bits[0]);
      return bits.join(" ");
    })
    .join(", ");
}

function rewriteCss(proxyOrigin, baseUrl, css) {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (all, q, raw) => {
    if (!raw || /^data:/i.test(raw) || raw.startsWith("#")) return all;
    const rewritten = resolveAndProxy(proxyOrigin, baseUrl, raw);
    return `url("${rewritten}")`;
  });
}

class UrlAttrHandler {
  constructor(proxyOrigin, baseUrl, attrs) {
    this.proxyOrigin = proxyOrigin;
    this.baseUrl = baseUrl;
    this.attrs = attrs;
  }

  element(element) {
    for (const attr of this.attrs) {
      const value = element.getAttribute(attr);
      if (value) {
        element.setAttribute(
          attr,
          resolveAndProxy(this.proxyOrigin, this.baseUrl, value)
        );
      }
    }

    const srcset = element.getAttribute("srcset");
    if (srcset) {
      element.setAttribute(
        "srcset",
        rewriteSrcset(this.proxyOrigin, this.baseUrl, srcset)
      );
    }

    const style = element.getAttribute("style");
    if (style) {
      element.setAttribute(
        "style",
        rewriteCss(this.proxyOrigin, this.baseUrl, style)
      );
    }
  }
}

class StyleTextHandler {
  constructor(proxyOrigin, baseUrl) {
    this.proxyOrigin = proxyOrigin;
    this.baseUrl = baseUrl;
  }

  text(textChunk) {
    if (textChunk.text) {
      textChunk.replace(
        rewriteCss(this.proxyOrigin, this.baseUrl, textChunk.text),
        { html: false }
      );
    }
  }
}

function filteredHeaders(original) {
  const headers = new Headers(original);

  // Do not pass site session cookies through Genesis Proxy.
  headers.delete("set-cookie");
  headers.delete("set-cookie2");

  // The proxy itself is intended to render its response inside Genesis.
  headers.delete("x-frame-options");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");

  headers.set("access-control-allow-origin", "*");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("x-genesis-proxy", "1");

  return headers;
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/health") {
      return new Response("Genesis Proxy OK", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("Genesis Proxy supports GET and HEAD only.", {
        status: 405,
        headers: { "allow": "GET, HEAD" }
      });
    }

    const raw = incoming.searchParams.get("url");
    if (!raw) {
      return new Response(
        "Genesis Proxy is online. Use ?url=https%3A%2F%2Fexample.com",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    let target;
    try {
      target = safeTarget(raw);
    } catch (err) {
      return new Response(String(err.message || err), { status: 400 });
    }

    const upstreamHeaders = new Headers();
    upstreamHeaders.set(
      "accept",
      request.headers.get("accept") ||
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    );
    upstreamHeaders.set(
      "accept-language",
      request.headers.get("accept-language") || "en-US,en;q=0.8"
    );

    let response;
    try {
      response = await fetch(target.href, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow"
      });
    } catch {
      return new Response("The destination could not be reached.", {
        status: 502
      });
    }

    const finalUrl = response.url || target.href;

    // Refuse redirects/final destinations into blocked/private hosts.
    try {
      safeTarget(finalUrl);
    } catch {
      return new Response("Blocked redirect destination.", { status: 403 });
    }

    const headers = filteredHeaders(response.headers);
    const contentType = (headers.get("content-type") || "").toLowerCase();

    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    if (contentType.includes("text/html")) {
      headers.delete("content-length");

      const proxyOrigin = incoming.origin;
      const handler = new UrlAttrHandler(
        proxyOrigin,
        finalUrl,
        ["href", "src", "action", "poster", "data"]
      );

      return new HTMLRewriter()
        .on("a", handler)
        .on("link", handler)
        .on("script", handler)
        .on("img", handler)
        .on("source", handler)
        .on("video", handler)
        .on("audio", handler)
        .on("iframe", handler)
        .on("form", handler)
        .on("object", handler)
        .on("[style]", handler)
        .on("style", new StyleTextHandler(proxyOrigin, finalUrl))
        .transform(new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        }));
    }

    if (contentType.includes("text/css")) {
      const text = await response.text();
      headers.delete("content-length");
      return new Response(
        rewriteCss(incoming.origin, finalUrl, text),
        {
          status: response.status,
          statusText: response.statusText,
          headers
        }
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
