package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestWriteAnthropicConfig_SkippedWhenEmpty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteAnthropicConfig("", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "anthropic-config.json")); !os.IsNotExist(err) {
		t.Errorf("expected no file; stat err: %v", err)
	}
}

func TestWriteAnthropicConfig_WritesWith0o600(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteAnthropicConfig("sk-ant-test", ""); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(tmp, "anthropic-config.json")
	st, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		if mode := st.Mode().Perm(); mode != 0o600 {
			t.Errorf("expected 0o600, got %o", mode)
		}
	}
	data, _ := os.ReadFile(path)
	var cfg anthropicConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "sk-ant-test" {
		t.Errorf("expected apiKey sk-ant-test, got %q", cfg.APIKey)
	}
	if cfg.Model != "claude-haiku-4-5-20251001" {
		t.Errorf("expected default model, got %q", cfg.Model)
	}
}

func TestWriteCanvasConfig_RequiresBothFields(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteCanvasConfig("bsu.instructure.com", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "canvas-config.json")); !os.IsNotExist(err) {
		t.Error("expected no file when token is empty")
	}
	if err := WriteCanvasConfig("bsu.instructure.com", "tok"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "canvas-config.json")); err != nil {
		t.Fatal(err)
	}
}

func TestWriteVersionMarker_StripsVPrefix(t *testing.T) {
	tmp := t.TempDir()
	if err := WriteVersionMarker(tmp, "v0.9.1"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(tmp, ".canvas-toolchain-version"))
	if string(data) != "0.9.1" {
		t.Errorf("expected 0.9.1, got %q", string(data))
	}
}
