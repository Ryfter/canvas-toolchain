package tasks

import "testing"

func TestNormalizeCanvasHost(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"bare subdomain gets instructure suffix", "exampleucanvas", "exampleucanvas.instructure.com"},
		{"full host unchanged", "exampleucanvas.instructure.com", "exampleucanvas.instructure.com"},
		{"strips https scheme", "https://exampleucanvas.instructure.com", "exampleucanvas.instructure.com"},
		{"strips http scheme", "http://example.instructure.com", "example.instructure.com"},
		{"strips path", "https://exampleucanvas.instructure.com/courses/1", "exampleucanvas.instructure.com"},
		{"strips trailing slash", "example.instructure.com/", "example.instructure.com"},
		{"trims whitespace and lowercases", "  Exampleucanvas  ", "exampleucanvas.instructure.com"},
		{"vanity domain left alone", "canvas.exampleu.edu", "canvas.exampleu.edu"},
		{"strips trailing dot then suffixes bare label", "exampleucanvas.", "exampleucanvas.instructure.com"},
		{"scheme plus bare label", "https://exampleucanvas", "exampleucanvas.instructure.com"},
		{"empty stays empty", "", ""},
		{"whitespace-only stays empty", "   ", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := NormalizeCanvasHost(tc.in); got != tc.want {
				t.Errorf("NormalizeCanvasHost(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizeCanvasHostIsIdempotent(t *testing.T) {
	for _, in := range []string{"exampleucanvas", "https://example.instructure.com/x", "canvas.exampleu.edu", ""} {
		once := NormalizeCanvasHost(in)
		twice := NormalizeCanvasHost(once)
		if once != twice {
			t.Errorf("not idempotent for %q: once=%q twice=%q", in, once, twice)
		}
	}
}
