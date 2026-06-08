package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteModulesManifestEnablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "modules.json"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m struct {
		Modules map[string]struct {
			Enabled        bool   `json:"enabled"`
			ActiveProvider string `json:"activeProvider"`
		} `json:"modules"`
	}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !m.Modules["video"].Enabled || m.Modules["video"].ActiveProvider != "panopto" {
		t.Fatalf("video not enabled with panopto provider: %+v", m.Modules["video"])
	}
}

func TestWriteModulesManifestDisablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, false); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "modules.json"))
	var m struct {
		Modules map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"modules"`
	}
	_ = json.Unmarshal(data, &m)
	if m.Modules["video"].Enabled {
		t.Fatalf("video should be disabled")
	}
}
