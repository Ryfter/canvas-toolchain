package tasks

import "testing"

func TestNormalizeCanvasHost(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"bare subdomain gets instructure suffix", "boisestatecanvas", "boisestatecanvas.instructure.com"},
		{"full host unchanged", "boisestatecanvas.instructure.com", "boisestatecanvas.instructure.com"},
		{"strips https scheme", "https://boisestatecanvas.instructure.com", "boisestatecanvas.instructure.com"},
		{"strips http scheme", "http://example.instructure.com", "example.instructure.com"},
		{"strips path", "https://boisestatecanvas.instructure.com/courses/1", "boisestatecanvas.instructure.com"},
		{"strips trailing slash", "example.instructure.com/", "example.instructure.com"},
		{"trims whitespace and lowercases", "  Boisestatecanvas  ", "boisestatecanvas.instructure.com"},
		{"vanity domain left alone", "canvas.boisestate.edu", "canvas.boisestate.edu"},
		{"strips trailing dot then suffixes bare label", "boisestatecanvas.", "boisestatecanvas.instructure.com"},
		{"scheme plus bare label", "https://boisestatecanvas", "boisestatecanvas.instructure.com"},
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
	for _, in := range []string{"boisestatecanvas", "https://example.instructure.com/x", "canvas.boisestate.edu", ""} {
		once := NormalizeCanvasHost(in)
		twice := NormalizeCanvasHost(once)
		if once != twice {
			t.Errorf("not idempotent for %q: once=%q twice=%q", in, once, twice)
		}
	}
}
