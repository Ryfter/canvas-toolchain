package tasks

import "strings"

// NormalizeCanvasHost turns whatever the user typed into the Canvas host field
// into a bare, resolvable hostname.
//
// It is forgiving on purpose: people paste full URLs, leave trailing slashes,
// or — most commonly — type only their school's subdomain (e.g. "boisestatecanvas")
// because the field's example text made the ".instructure.com" suffix look like it
// was already there. In that bare-label case we append ".instructure.com" so the
// value validates instead of failing DNS as "no such host".
//
// Vanity Canvas domains (anything that already contains a dot, e.g.
// "canvas.boisestate.edu") are left untouched. The function is idempotent.
func NormalizeCanvasHost(raw string) string {
	host := strings.ToLower(strings.TrimSpace(raw))
	if host == "" {
		return ""
	}

	// Drop a leading scheme if the user pasted a full URL.
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")

	// Keep only the host[:port] portion, dropping any path/query.
	if i := strings.IndexAny(host, "/?"); i >= 0 {
		host = host[:i]
	}

	// Tidy stray trailing dots/whitespace.
	host = strings.TrimRight(strings.TrimSpace(host), ".")
	if host == "" {
		return ""
	}

	// A bare label (no dot) is almost certainly a school subdomain — complete it.
	if !strings.Contains(host, ".") {
		host += ".instructure.com"
	}
	return host
}
