package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

func CcHomePath() string {
	if v := os.Getenv("CC_HOME"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".command-and-control")
}

func atomicWriteJSON(path string, v any, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

type anthropicConfig struct {
	APIKey          string `json:"apiKey"`
	Model           string `json:"model"`
	ConfiguredAt    string `json:"configuredAt"`
	LastValidatedAt string `json:"lastValidatedAt"`
}

func WriteAnthropicConfig(apiKey, model string) error {
	if apiKey == "" {
		return nil
	}
	if model == "" {
		model = "claude-haiku-4-5-20251001"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "anthropic-config.json"),
		anthropicConfig{APIKey: apiKey, Model: model, ConfiguredAt: now, LastValidatedAt: ""},
		credentialFileMode(),
	)
}

type canvasConfig struct {
	Host            string `json:"host"`
	Token           string `json:"token"`
	ConfiguredAt    string `json:"configuredAt"`
	LastValidatedAt string `json:"lastValidatedAt"`
}

func WriteCanvasConfig(host, token string) error {
	host = NormalizeCanvasHost(host)
	if host == "" || token == "" {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "canvas-config.json"),
		canvasConfig{Host: host, Token: token, ConfiguredAt: now, LastValidatedAt: ""},
		credentialFileMode(),
	)
}

type panoptoConfig struct {
	Domain            string `json:"domain"`
	ClientID          string `json:"clientId"`
	ClientSecret      string `json:"clientSecret"`
	IframeWhitelisted any    `json:"iframeWhitelisted"`
	ConfiguredAt      string `json:"configuredAt"`
	LastValidatedAt   string `json:"lastValidatedAt"`
}

func WritePanoptoConfig(domain, clientID, clientSecret string) error {
	if domain == "" || clientID == "" || clientSecret == "" {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "panopto-config.json"),
		panoptoConfig{
			Domain: domain, ClientID: clientID, ClientSecret: clientSecret,
			IframeWhitelisted: nil, ConfiguredAt: now, LastValidatedAt: "",
		},
		credentialFileMode(),
	)
}

func WriteVersionMarker(installDir, version string) error {
	clean := version
	if len(clean) > 0 && (clean[0] == 'v' || clean[0] == 'V') {
		clean = clean[1:]
	}
	return os.WriteFile(filepath.Join(installDir, ".canvas-toolchain-version"), []byte(clean), 0o644)
}

func credentialFileMode() os.FileMode {
	if runtime.GOOS == "windows" {
		return 0o600
	}
	return 0o600
}
