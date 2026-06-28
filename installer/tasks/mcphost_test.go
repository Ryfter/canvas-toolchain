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

func TestWriteJSONServers_CreatesWithServersKeyAndType(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "mcp.json")
	if err := writeJSONServersHostConfig(path, "/node", "/app/index.js"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	servers, ok := parsed["servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected top-level 'servers' key, got %v", parsed)
	}
	entry := servers["canvas-toolchain"].(map[string]any)
	if entry["type"] != "stdio" {
		t.Errorf("expected type stdio, got %v", entry["type"])
	}
	if entry["command"] != "/node" {
		t.Errorf("expected command /node, got %v", entry["command"])
	}
}

func TestWriteJSONServers_PreservesExisting(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "mcp.json")
	initial := map[string]any{
		"inputs": []any{"x"},
		"servers": map[string]any{
			"other": map[string]any{"command": "/keep"},
		},
	}
	data, _ := json.Marshal(initial)
	_ = os.WriteFile(path, data, 0o644)

	if err := writeJSONServersHostConfig(path, "/n", "/s"); err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(path)
	var parsed map[string]any
	_ = json.Unmarshal(out, &parsed)
	if parsed["inputs"] == nil {
		t.Error("top-level inputs dropped")
	}
	servers := parsed["servers"].(map[string]any)
	if _, ok := servers["other"]; !ok {
		t.Error("existing 'other' server dropped")
	}
	if _, ok := servers["canvas-toolchain"]; !ok {
		t.Error("canvas-toolchain not added")
	}
}

func TestWriteJSONServers_ErrorOnMalformed(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "broken.json")
	_ = os.WriteFile(path, []byte("{nope"), 0o644)
	if err := writeJSONServersHostConfig(path, "/n", "/s"); err == nil {
		t.Fatal("expected error on malformed JSON")
	}
}
