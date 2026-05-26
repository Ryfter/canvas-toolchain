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
