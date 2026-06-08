package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type moduleEntry struct {
	Enabled        bool   `json:"enabled"`
	ActiveProvider string `json:"activeProvider,omitempty"`
}

type modulesManifest struct {
	Modules map[string]moduleEntry `json:"modules"`
}

// WriteModulesManifest writes ~/.command-and-control/modules.json describing which
// plug-in modules are enabled. ccHome is the config directory; videoEnabled toggles
// the Lecture Video module (Panopto provider).
func WriteModulesManifest(ccHome string, videoEnabled bool) error {
	entry := moduleEntry{Enabled: videoEnabled}
	if videoEnabled {
		entry.ActiveProvider = "panopto"
	}
	m := modulesManifest{Modules: map[string]moduleEntry{"video": entry}}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(ccHome, 0o700); err != nil {
		return err
	}
	tmp := filepath.Join(ccHome, "modules.json.tmp")
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(ccHome, "modules.json"))
}
