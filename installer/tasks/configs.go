package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// CcHomePath is the Command & Control config directory. The installer only
// reads and merges the module manifest there; it writes no credentials — those
// are collected in the professor's first chat (ct_setup).
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

func WriteVersionMarker(installDir, version string) error {
	clean := version
	if len(clean) > 0 && (clean[0] == 'v' || clean[0] == 'V') {
		clean = clean[1:]
	}
	return os.WriteFile(filepath.Join(installDir, ".canvas-toolchain-version"), []byte(clean), 0o644)
}
