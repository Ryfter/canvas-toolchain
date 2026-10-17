package tasks

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const modulesManifestFile = "modules.json"

// WriteModulesManifest sets the video module entry in <ccHome>/modules.json.
// The installer owns only that one toggle: every other module entry (the ones
// C&C or the user enabled) and every field it does not recognize are merged
// through untouched, so an installer run can no longer wipe a configured
// manifest. The file C&C reads is
// {"modules":{"<id>":{"enabled":bool,"activeProvider"?:string}}}.
//
// A file that exists but does not hold a JSON object is copied to
// modules.json.bak-<timestamp> before a fresh manifest is written — a broken
// file is never silently discarded.
func WriteModulesManifest(ccHome string, videoEnabled bool) error {
	path := filepath.Join(ccHome, modulesManifestFile)
	doc, err := loadModulesManifestDoc(path)
	if err != nil {
		return err
	}

	modules, ok := doc["modules"].(map[string]any)
	if !ok {
		modules = map[string]any{}
	}
	entry, ok := modules["video"].(map[string]any)
	if !ok {
		entry = map[string]any{}
	}
	entry["enabled"] = videoEnabled
	if videoEnabled {
		entry["activeProvider"] = "panopto"
	} else {
		delete(entry, "activeProvider")
	}
	modules["video"] = entry
	doc["modules"] = modules

	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(ccHome, 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// loadModulesManifestDoc returns the existing manifest as a generic document so
// unknown fields survive the round trip. Numbers are kept as json.Number so a
// large integer is not silently rounded through a float64. A missing file is an
// empty document; an unreadable one is backed up and treated as empty.
func loadModulesManifestDoc(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{}, nil
		}
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var doc map[string]any
	if err := dec.Decode(&doc); err != nil || doc == nil {
		if _, berr := backupModulesManifest(path, raw); berr != nil {
			return map[string]any{}, fmt.Errorf(
				"%s is not a valid modules manifest and could not be backed up (%w); "+
					"move it aside and re-run the installer", path, berr)
		}
		return map[string]any{}, nil
	}
	return doc, nil
}

// backupModulesManifest copies raw to <path>.bak-<UTC timestamp>.
func backupModulesManifest(path string, raw []byte) (string, error) {
	backup := fmt.Sprintf("%s.bak-%s", path, time.Now().UTC().Format("20060102T150405Z"))
	if err := os.WriteFile(backup, raw, 0o600); err != nil {
		return "", err
	}
	return backup, nil
}
