/* The Android host injects a per-document random capability before this file.
 * In a normal browser there is no native bridge and no network request here. */
(function () {
  document.documentElement.dataset.host = window.__DM_NATIVE_TOKEN__ && window.DonMuseNative ? "android" : "web";
})();
