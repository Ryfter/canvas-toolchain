package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

func ClaudeDesktopConfigPath() string {
	home, _ := os.UserHomeDir()
	var dir string
	switch runtime.GOOS {
	case "darwin":
		dir = filepath.Join(home, "Library", "Application Support", "Claude")
	case "windows":
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return ""
		}
		dir = filepath.Join(appdata, "Claude")
	default:
		dir = filepath.Join(home, ".config", "Claude")
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "claude_desktop_config.json")
}

func ClaudeCodeConfigPath() string {
	home, _ := os.UserHomeDir()
	path := filepath.Join(home, ".claude.json")
	if _, err := os.Stat(filepath.Join(home, ".claude")); err == nil {
		return path
	}
	if _, err := os.Stat(path); err == nil {
		return path
	}
	return ""
}

type ConfigFormat int

const (
	FormatJSONMcpServers ConfigFormat = iota // JSON, "mcpServers" key
	FormatJSONServers                        // JSON, "servers" key (VS Code)
	FormatTOML                               // TOML, [mcp_servers.*] (Codex)
)

type Host struct {
	ID          string
	DisplayName string
	Format      ConfigFormat
	ResolvePath func() string
}

func CodexConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".codex")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "config.toml")
}

func GeminiConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".gemini")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	settings := filepath.Join(dir, "settings.json")
	// Gemini CLI is present when its settings file exists, or when there is no
	// Antigravity config/ subdir occupying ~/.gemini. This avoids treating an
	// Antigravity-only ~/.gemini (which has config/ but no Gemini CLI) as Gemini.
	if _, err := os.Stat(settings); err == nil {
		return settings
	}
	if _, err := os.Stat(filepath.Join(dir, "config")); err != nil {
		return settings
	}
	return ""
}

func CursorConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".cursor")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp.json")
}

func KiroConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".kiro")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "settings", "mcp.json")
}

func AntigravityConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".gemini", "config")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp_config.json")
}

func VSCodeConfigPath() string {
	home, _ := os.UserHomeDir()
	var dir string
	switch runtime.GOOS {
	case "darwin":
		dir = filepath.Join(home, "Library", "Application Support", "Code", "User")
	case "windows":
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return ""
		}
		dir = filepath.Join(appdata, "Code", "User")
	default:
		dir = filepath.Join(home, ".config", "Code", "User")
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp.json")
}

func SupportedHosts() []Host {
	return []Host{
		{ID: "claude-desktop", DisplayName: "Claude Desktop", Format: FormatJSONMcpServers, ResolvePath: ClaudeDesktopConfigPath},
		{ID: "claude-code", DisplayName: "Claude Code", Format: FormatJSONMcpServers, ResolvePath: ClaudeCodeConfigPath},
		{ID: "codex", DisplayName: "Codex CLI", Format: FormatTOML, ResolvePath: CodexConfigPath},
		{ID: "gemini", DisplayName: "Gemini CLI", Format: FormatJSONMcpServers, ResolvePath: GeminiConfigPath},
		{ID: "cursor", DisplayName: "Cursor", Format: FormatJSONMcpServers, ResolvePath: CursorConfigPath},
		{ID: "vscode", DisplayName: "VS Code", Format: FormatJSONServers, ResolvePath: VSCodeConfigPath},
		{ID: "kiro", DisplayName: "Kiro", Format: FormatJSONMcpServers, ResolvePath: KiroConfigPath},
		{ID: "antigravity", DisplayName: "Antigravity", Format: FormatJSONMcpServers, ResolvePath: AntigravityConfigPath},
	}
}

func DetectConnectHosts() map[string]bool {
	out := map[string]bool{}
	for _, h := range SupportedHosts() {
		out[h.ID] = h.ResolvePath() != ""
	}
	return out
}

type mcpServerEntry struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

func WriteHostConfig(path, nodeBin, ccServerJS string) error {
	if path == "" {
		return nil
	}
	existing := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &existing); err != nil {
			return err
		}
	}
	servers, _ := existing["mcpServers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers["canvas-toolchain"] = mcpServerEntry{Command: nodeBin, Args: []string{ccServerJS}}
	existing["mcpServers"] = servers
	return atomicWriteJSON(path, existing, 0o644)
}

func writeJSONServersHostConfig(path, nodeBin, ccServerJS string) error {
	if path == "" {
		return nil
	}
	existing := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &existing); err != nil {
			return err
		}
	}
	servers, _ := existing["servers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers["canvas-toolchain"] = map[string]any{
		"type":    "stdio",
		"command": nodeBin,
		"args":    []string{ccServerJS},
	}
	existing["servers"] = servers
	return atomicWriteJSON(path, existing, 0o644)
}
