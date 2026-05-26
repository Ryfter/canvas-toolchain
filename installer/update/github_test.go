package update

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRelease_Unmarshal(t *testing.T) {
	body := `{
		"tag_name": "v1.0.0",
		"html_url": "https://github.com/Ryfter/canvas-toolchain/releases/tag/v1.0.0",
		"assets": [
			{"name": "canvas-toolchain-installer-windows-x64.exe", "browser_download_url": "https://example/win.exe"}
		]
	}`
	var r Release
	if err := json.Unmarshal([]byte(body), &r); err != nil {
		t.Fatal(err)
	}
	if r.TagName != "v1.0.0" {
		t.Errorf("tag: %q", r.TagName)
	}
	if len(r.Assets) != 1 {
		t.Errorf("expected 1 asset, got %d", len(r.Assets))
	}
	if !strings.Contains(r.Assets[0].BrowserDownloadURL, "win.exe") {
		t.Errorf("download URL: %q", r.Assets[0].BrowserDownloadURL)
	}
}
