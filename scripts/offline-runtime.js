/* DON MUSE — offline bundle runtime (injected into every captured page).
 *
 * This file is *not* bundled by Next. scripts/offline-bundle.mjs reads it as
 * text, substitutes the __DM_* tokens, and inlines it into each page's <head>.
 * Keeping it as a separate .js file means it is normal JavaScript: it can be
 * syntax-checked and it needs no escaping gymnastics in the bundler.
 *
 * What it does:
 *   1. fetch('/api/…')   → reads the baked snapshot next to the page
 *   2. <a href="/x">     → navigates to the real static page (never a blank one)
 *   3. /absolute/asset   → resolved inside the bundle, wherever it is served from
 *   4. exposes the offline metadata so the diagnostics screen can show it
 */
(function () {
  var ROOT = @@DM_ROOT@@;
  var PAGE = @@DM_PAGE@@;
  var SNAPSHOT = @@DM_SNAPSHOT@@;
  var ROUTES = @@DM_ROUTES@@;

  // Android serves these bundled pages on the same host as the live API.
  // The bridge reports the real server origin; the HTML/CSS/JS still comes
  // from packaged assets, while /api requests go to the live backend.
  try {
    if (window.DonMuseNative && typeof window.DonMuseNative.platformInfo === "function") {
      var nativeInfo = JSON.parse(window.DonMuseNative.platformInfo() || "{}");
      var apiBase = typeof nativeInfo.server === "string" ? nativeInfo.server.replace(/\\/+$/, "") : "";
      if (/^https?:\\/\\//i.test(apiBase)) window.__DM_API_BASE__ = apiBase;
    }
  } catch (e) { /* local UI remains usable without a native bridge */ }

  window.__DM_STATIC__ = true;
  window.__DM_OFFLINE__ = true;
  window.__DM_BUILD__ = @@DM_BUILD_ID@@;
  window.__DM_BUILT_AT__ = @@DM_BUILT_AT@@;
  window.__DM_ROOT__ = ROOT;
  window.__DM_OFFLINE_MISSES__ = [];

  /* ------------------------------ helpers ------------------------------- */
  function isFileProtocol() {
    return /^file:/i.test(String(window.location.protocol));
  }

  function snapshotFile(url) {
    var clean = String(url || "").split("#")[0];
    var noOrigin = clean.replace(/^https?:\/\/[^/]+/i, "");
    if (noOrigin.indexOf("/api/") !== 0) return null;
    if (SNAPSHOT[noOrigin]) return SNAPSHOT[noOrigin];
    var bare = noOrigin.split("?")[0];
    return SNAPSHOT[bare] || null;
  }

  function absolute(u) {
    if (typeof u !== "string" || !u) return u;
    if (u.charAt(0) !== "/" || u.charAt(1) === "/") return u;
    return ROOT.replace(/\/+$/, "") + u;
  }

  /** The route this document is currently showing ("", "radio", …). */
  function currentRoute() {
    var href = String(window.location.href || "");
    if (!isFileProtocol()) {
      return window.location.pathname
        .replace(/index\.html$/i, "")
        .replace(/^\/+|\/+$/g, "");
    }
    var noQuery = href.split("?")[0].split("#")[0];
    var parts = noQuery.replace(/^file:\/\/\/?/, "/").split("/");
    var i = parts.lastIndexOf("www");
    var rest = (i >= 0 ? parts.slice(i + 1) : parts.slice(-2)).join("/");
    return rest.replace(/index\.html$/i, "").replace(/^\/+|\/+$/g, "");
  }

  /** "/radio" → the static page that actually exists. */
  function routeHref(href) {
    if (!href) return null;
    // The offline HTML is nested in route folders, so internal anchors may be
    // relative ("../search"). Resolve them against the current local origin
    // before checking the route allow-list. External links remain untouched.
    try {
      var resolved = new URL(href, window.location.href);
      if (resolved.origin !== window.location.origin) return null;
      href = resolved.pathname + resolved.search + resolved.hash;
    } catch (e) {
      return null;
    }
    if (href.charAt(0) !== "/" || href.charAt(1) === "/") return null;
    var hashSplit = href.split("#");
    var hash = hashSplit.length > 1 ? "#" + hashSplit.slice(1).join("#") : "";
    var querySplit = hashSplit[0].split("?");
    var query = querySplit.length > 1 ? "?" + querySplit.slice(1).join("?") : "";
    var clean = querySplit[0].replace(/^\/+/, "").replace(/\/+$/, "");
    // Unknown route (track/album/playlist ids, …): the bundle has no page for it,
    // so go home instead of asking for a file that does not exist.
    if (clean && ROUTES.indexOf(clean) === -1) return ROOT + "index.html";
    return (clean ? ROOT + clean + "/index.html" : ROOT + "index.html") + query + hash;
  }

  /* ------------------------------- fetch -------------------------------- */
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var path = null;
    try {
      var parsed = new URL(String(url), window.location.href);
      if (parsed.pathname.indexOf("/api/") === 0) path = parsed.pathname + parsed.search + parsed.hash;
    } catch (e) { /* non-URL input */ }

    if (path && origFetch) {
      // Try the real API first. If the device is offline (or the server is
      // temporarily unreachable), read-only GETs may fall back to the build
      // snapshot. Writes are never simulated or replayed from a snapshot.
      return origFetch(input, init).catch(function (err) {
        var file = method === "GET" ? snapshotFile(path) : null;
        if (file) {
          return origFetch(ROOT + "api-snapshot/" + file, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("offline snapshot missing: " + file);
            return r;
          });
        }
        window.__DM_OFFLINE_MISSES__.push(String(url));
        throw err;
      });
    }

    if (String(url).indexOf("/api/") !== -1) {
      window.__DM_OFFLINE_MISSES__.push(String(url));
      return Promise.reject(new Error("offline: " + url));
    }
    if (!origFetch) return Promise.reject(new Error("offline"));
    return origFetch(input, init);
  };
  /* ---------------------------- navigation ------------------------------ */
  window.__DM_ROUTE_HREF__ = routeHref;
  document.addEventListener(
    "click",
    function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      var next = routeHref(a.getAttribute("href"));
      if (!next) return;
      ev.preventDefault();
      window.location.href = next;
    },
    true,
  );

  /* ------------------------- asset URL rewriting ------------------------ */
  // Static files may be served from a sub-path (file:// or /<repo>/), so every
  // root-absolute URL that reaches the DOM is resolved inside the bundle.
  if (isFileProtocol() || ROOT !== "/") {
    var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: true,
        get: desc.get,
        set: function (v) {
          desc.set.call(this, absolute(v));
        },
      });
    }
    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (name === "src" || name === "poster") value = absolute(value);
      return setAttribute.call(this, name, value);
    };
  }

  /* -------------------- right screen for this URL ----------------------- */
  try {
    var wanted = currentRoute();
    window.__DM_LAST_ROUTE__ = wanted;
    if (wanted !== PAGE) {
      if (ROUTES.indexOf(wanted) !== -1) {
        window.location.replace(routeHref("/" + wanted));
      } else if (!isFileProtocol()) {
        window.location.replace(ROOT + "index.html");
      }
    }
  } catch (e) {
    /* never let the bootstrap break the page */
  }

  window.__DM_OFFLINE_INFO__ = {
    buildId: @@DM_BUILD_ID@@,
    builtAt: @@DM_BUILT_AT@@,
    routes: ROUTES,
    endpoints: Object.keys(SNAPSHOT).length,
    page: PAGE,
  };
})();
