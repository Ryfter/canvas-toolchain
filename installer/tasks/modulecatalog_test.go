// installer/tasks/modulecatalog_test.go
package tasks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

const catalogJSON = `{"catalogVersion":1,"modules":[
  {"id":"announcements","name":"Announcements Auditor","description":"Audit scheduled announcements.","version":"1.0.0","minHostVersion":"2.0.0","artifactUrl":"https://example.invalid/a.mjs","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10},
  {"id":"video","name":"Lecture Video","description":"Bundled.","version":"1.0.0","minHostVersion":"1.0.0","artifactUrl":"https://example.invalid/v.mjs","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10,"bundled":true}
]}`

func TestFetchModuleCatalogFiltersBundled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(catalogJSON))
	}))
	defer srv.Close()
	mods, err := FetchModuleCatalog(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mods) != 1 || mods[0].ID != "announcements" {
		t.Fatalf("expected only the non-bundled module, got %+v", mods)
	}
}

const catalogV2JSON = `{"catalogVersion":2,"modules":[
  {"id":"announcements","name":"Announcements Auditor","description":"Audit scheduled announcements.","version":"1.1.0"},
  {"id":"video","name":"Lecture Video","description":"Bundled.","version":"1.0.0","bundled":true}
],"companions":[
  {"id":"canvas-backup","name":"Canvas Backup","summary":"Downloads a complete local archive.","whyYouWantIt":"Starting point of the course-refresh pipeline.","url":"https://github.com/Ryfter/canvas-backup","worksWithoutToolchain":true}
]}`

func TestFetchModuleCatalogAcceptsVersion2(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(catalogV2JSON))
	}))
	defer srv.Close()
	mods, err := FetchModuleCatalog(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("catalogVersion 2 should be accepted: %v", err)
	}
	if len(mods) != 1 || mods[0].ID != "announcements" {
		t.Fatalf("expected only the non-bundled module (companions are not installable), got %+v", mods)
	}
}

func TestFetchModuleCatalogRejectsUnknownVersion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"catalogVersion":99,"modules":[]}`))
	}))
	defer srv.Close()
	if _, err := FetchModuleCatalog(context.Background(), srv.URL); err == nil {
		t.Fatal("expected an error for catalogVersion 99")
	}
}

func TestWritePendingModuleRequests(t *testing.T) {
	home := t.TempDir()
	path, err := WritePendingModuleRequests(home, []string{"announcements"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if filepath.Base(path) != "pending-module-installs.json" {
		t.Fatalf("wrong filename: %s", path)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	var got struct {
		RequestedAt string   `json:"requestedAt"`
		Modules     []string `json:"modules"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if len(got.Modules) != 1 || got.Modules[0] != "announcements" || got.RequestedAt == "" {
		t.Fatalf("unexpected payload: %+v", got)
	}
}

func TestWritePendingModuleRequestsSkipsWhenEmpty(t *testing.T) {
	home := t.TempDir()
	path, err := WritePendingModuleRequests(home, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != "" {
		t.Fatalf("expected no file for empty request, got %s", path)
	}
}
