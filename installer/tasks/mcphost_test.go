package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteHostConfig_CreatesFileWhenAbsent(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "claude_desktop_config.json")
	if err := WriteHostConfig(path, "/node/bin/node", "/app/dist/index.js"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	servers := parsed["mcpServers"].(map[string]any)
	entry := servers["canvas-toolchain"].(map[string]any)
	if entry["command"] != "/node/bin/node" {
		t.Errorf("expected command set, got %v", entry["command"])
	}
}

func TestWriteHostConfig_PreservesExistingEntries(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "claude_desktop_config.json")
	initial := map[string]any{
		"someOtherKey": "kept",
		"mcpServers": map[string]any{
			"my-other-server": map[string]any{"command": "/keep"},
		},
	}
	data, _ := json.Marshal(initial)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := WriteHostConfig(path, "/n", "/s"); err != nil {
		t.Fatal(err)
	}

	out, _ := os.ReadFile(path)
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed["someOtherKey"] != "kept" {
		t.Errorf("top-level key dropped: %v", parsed["someOtherKey"])
	}
	servers := parsed["mcpServers"].(map[string]any)
	if _, ok := servers["my-other-server"]; !ok {
		t.Error("existing my-other-server entry dropped")
	}
	if _, ok := servers["canvas-toolchain"]; !ok {
		t.Error("canvas-toolchain entry not added")
	}
}

func TestWriteHostConfig_NoOpOnEmptyPath(t *testing.T) {
	if err := WriteHostConfig("", "/n", "/s"); err != nil {
		t.Errorf("expected no error on empty path, got %v", err)
	}
}

func TestWriteHostConfig_ReturnsErrorOnMalformedJSON(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "broken.json")
	if err := os.WriteFile(path, []byte("not valid json {"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteHostConfig(path, "/n", "/s"); err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}
