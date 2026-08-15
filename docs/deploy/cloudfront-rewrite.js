// CloudFront Function — viewer request
// ---------------------------------------------------------------------------
// Serves the Astro/Starlight static build (build.format: 'directory') from
// S3 behind CloudFront with clean, professional URLs:
//
//   • NO trailing slash   →  /guides/recipes           (never /guides/recipes/)
//   • NO .html extension  →  /guides/recipes           (never /guides/recipes.html)
//
// The pages exist on disk as  /guides/recipes/index.html . This function maps
// the pretty URL to that object, and 301-redirects any legacy trailing-slash
// request back to the canonical slash-free URL.
//
// Runtime: cloudfront-js-2.0 (ECMAScript 5.1 — no let/const/arrow/includes).
// Attach to the distribution's default behavior on the "Viewer request" event.
// ---------------------------------------------------------------------------
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // 1) Canonicalize: 301 any trailing slash (except the root "/") to the
  //    slash-free URL, so a page is never reachable at two URLs.
  if (uri.length > 1 && uri.charAt(uri.length - 1) === '/') {
    var clean = uri;
    while (clean.length > 1 && clean.charAt(clean.length - 1) === '/') {
      clean = clean.substring(0, clean.length - 1);
    }
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { 'location': { value: clean } }
    };
  }

  // 2) Root → homepage document.
  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }

  // 3) Extensionless "pretty" URL → its index.html. Requests that already
  //    reference a file (asset, sitemap, robots, pagefind, etc.) pass through.
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }

  return request;
}
