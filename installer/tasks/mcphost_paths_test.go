package tasks

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// setHome points the OS home-dir lookup at dir for the duration of the test.
func setHome(t *testing.T, dir string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", dir)
		t.Setenv("APPDATA", filepath.Join(dir, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", dir)
	}
}

func TestCodexConfigPath_DetectedAndAbsent(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)

	if got := CodexConfigPath(); got != "" {
		t.Fatalf("expected empty path before ~/.codex exists, got %q", got)
	}

	if err := os.MkdirAll(filepath.Join(home, ".codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := CodexConfigPath()
	if filepath.Base(got) != "config.toml" {
		t.Fatalf("expected path ending in config.toml, got %q", got)
	}
}

func TestVSCodeConfigPath_Detected(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)

	var userDir string
	switch runtime.GOOS {
	case "darwin":
		userDir = filepath.Join(home, "Library", "Application Support", "Code", "User")
	case "windows":
		userDir = filepath.Join(home, "AppData", "Roaming", "Code", "User")
	default:
		userDir = filepath.Join(home, ".config", "Code", "User")
	}
	if got := VSCodeConfigPath(); got != "" {
		t.Fatalf("expected empty path before Code/User exists, got %q", got)
	}
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		t.Fatal(err)
	}
	got := VSCodeConfigPath()
	if filepath.Base(got) != "mcp.json" {
		t.Fatalf("expected path ending in mcp.json, got %q", got)
	}
}

func TestDetectConnectHosts_MarksDetected(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}
	detected := DetectConnectHosts()
	if !detected["cursor"] {
		t.Errorf("expected cursor detected, got %v", detected)
	}
	if detected["codex"] {
		t.Errorf("expected codex NOT detected, got %v", detected)
	}
}

func TestSupportedHosts_HasExpectedIDs(t *testing.T) {
	ids := map[string]bool{}
	byID := map[string]Host{}
	for _, h := range SupportedHosts() {
		ids[h.ID] = true
		byID[h.ID] = h
	}
	for _, want := range []string{"claude-desktop", "claude-code", "codex", "gemini", "cursor", "vscode", "kiro", "antigravity"} {
		if !ids[want] {
			t.Errorf("SupportedHosts missing %q", want)
		}
	}
	// Fix 3: verify Format assignments that Task 2 depends on.
	if h := byID["codex"]; h.Format != FormatTOML {
		t.Errorf("codex: expected FormatTOML (%d), got %d", FormatTOML, h.Format)
	}
	if h := byID["vscode"]; h.Format != FormatJSONServers {
		t.Errorf("vscode: expected FormatJSONServers (%d), got %d", FormatJSONServers, h.Format)
	}
	if h := byID["gemini"]; h.Format != FormatJSONMcpServers {
		t.Errorf("gemini: expected FormatJSONMcpServers (%d), got %d", FormatJSONMcpServers, h.Format)
	}
	if h := byID["claude-desktop"]; h.Format != FormatJSONMcpServers {
		t.Errorf("claude-desktop: expected FormatJSONMcpServers (%d), got %d", FormatJSONMcpServers, h.Format)
	}
}

func TestGeminiConfigPath_DetectedWhenNoAntigravityConfig(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".gemini"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := GeminiConfigPath()
	if filepath.Base(got) != "settings.json" {
		t.Fatalf("expected settings.json path, got %q", got)
	}
}

func TestGeminiConfigPath_NotDetectedWhenOnlyAntigravityConfig(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".gemini", "config"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := GeminiConfigPath(); got != "" {
		t.Fatalf("expected empty path for Antigravity-only ~/.gemini, got %q", got)
	}
}

func TestGeminiConfigPath_DetectedWhenBothPresent(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".gemini", "config"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".gemini", "settings.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := GeminiConfigPath(); filepath.Base(got) != "settings.json" {
		t.Fatalf("expected settings.json when both present, got %q", got)
	}
}

func TestAntigravityConfigPath_NoFalsePositiveFromGeminiOnly(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".gemini"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := AntigravityConfigPath(); got != "" {
		t.Fatalf("expected empty path when ~/.gemini/config absent, got %q", got)
	}
}
