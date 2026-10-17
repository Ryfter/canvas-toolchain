package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func readManifestDoc(t *testing.T, dir string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "modules.json"))
	if err != nil {
		t.Fatalf("read modules.json: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("modules.json is not a JSON object: %v", err)
	}
	return doc
}

func manifestModules(t *testing.T, doc map[string]any) map[string]any {
	t.Helper()
	modules, ok := doc["modules"].(map[string]any)
	if !ok {
		t.Fatalf("modules is not an object: %#v", doc["modules"])
	}
	return modules
}

func manifestEntry(t *testing.T, modules map[string]any, id string) map[string]any {
	t.Helper()
	entry, ok := modules[id].(map[string]any)
	if !ok {
		t.Fatalf("module %q is not an object: %#v", id, modules[id])
	}
	return entry
}

func writeManifestFile(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "modules.json"), []byte(content), 0o600); err != nil {
		t.Fatalf("seed modules.json: %v", err)
	}
}

func backupFiles(t *testing.T, dir string) []string {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(dir, "modules.json.bak-*"))
	if err != nil {
		t.Fatalf("glob backups: %v", err)
	}
	return matches
}

func TestWriteModulesManifestEnablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	video := manifestEntry(t, manifestModules(t, readManifestDoc(t, dir)), "video")
	if video["enabled"] != true || video["activeProvider"] != "panopto" {
		t.Fatalf("video not enabled with panopto provider: %#v", video)
	}
}

func TestWriteModulesManifestDisablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, false); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	video := manifestEntry(t, manifestModules(t, readManifestDoc(t, dir)), "video")
	if video["enabled"] != false {
		t.Fatalf("video should be disabled: %#v", video)
	}
	if _, present := video["activeProvider"]; present {
		t.Fatalf("activeProvider should be dropped when video is disabled: %#v", video)
	}
}

func TestWriteModulesManifestCreatesMissingFile(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "modules.json")); err != nil {
		t.Fatalf("modules.json not created: %v", err)
	}
	if got := backupFiles(t, dir); len(got) != 0 {
		t.Fatalf("no backup expected when there was no existing file, got %v", got)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(filepath.Join(dir, "modules.json"))
		if err != nil {
			t.Fatalf("stat modules.json: %v", err)
		}
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Fatalf("expected 0600 permissions, got %o", perm)
		}
	}
}

// The installer owns only the video toggle: modules C&C or the user enabled
// must survive an install/upgrade run.
func TestWriteModulesManifestPreservesOtherModules(t *testing.T) {
	dir := t.TempDir()
	writeManifestFile(t, dir, `{
	  "modules": {
	    "video": { "enabled": false },
	    "announcements": { "enabled": true },
	    "roster": { "enabled": true, "activeProvider": "peoplesoft" }
	  }
	}`)

	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}

	modules := manifestModules(t, readManifestDoc(t, dir))
	video := manifestEntry(t, modules, "video")
	if video["enabled"] != true || video["activeProvider"] != "panopto" {
		t.Fatalf("video was not toggled on: %#v", video)
	}
	if manifestEntry(t, modules, "announcements")["enabled"] != true {
		t.Fatalf("announcements entry was lost: %#v", modules)
	}
	roster := manifestEntry(t, modules, "roster")
	if roster["enabled"] != true || roster["activeProvider"] != "peoplesoft" {
		t.Fatalf("roster entry was altered: %#v", roster)
	}
}

func TestWriteModulesManifestTogglesVideoOffKeepingOtherModules(t *testing.T) {
	dir := t.TempDir()
	writeManifestFile(t, dir, `{
	  "modules": {
	    "video": { "enabled": true, "activeProvider": "panopto" },
	    "announcements": { "enabled": true }
	  }
	}`)

	if err := WriteModulesManifest(dir, false); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}

	modules := manifestModules(t, readManifestDoc(t, dir))
	video := manifestEntry(t, modules, "video")
	if video["enabled"] != false {
		t.Fatalf("video should be disabled: %#v", video)
	}
	if _, present := video["activeProvider"]; present {
		t.Fatalf("activeProvider should be dropped when video is disabled: %#v", video)
	}
	if manifestEntry(t, modules, "announcements")["enabled"] != true {
		t.Fatalf("announcements entry was lost: %#v", modules)
	}
}

// Unknown top-level fields and unknown per-entry fields must round-trip: C&C
// reads only modules.<id>.enabled/activeProvider, so nothing else is ours to drop.
func TestWriteModulesManifestPreservesUnknownFields(t *testing.T) {
	dir := t.TempDir()
	writeManifestFile(t, dir, `{
	  "schemaVersion": 3,
	  "futureTopLevel": { "keep": "me" },
	  "modules": {
	    "video": { "enabled": true, "activeProvider": "panopto", "note": "mine", "retries": 9007199254740993 },
	    "announcements": { "enabled": true, "schedule": ["a", "b"] }
	  }
	}`)

	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}

	doc := readManifestDoc(t, dir)
	if doc["schemaVersion"] != float64(3) {
		t.Fatalf("top-level schemaVersion lost: %#v", doc["schemaVersion"])
	}
	future, ok := doc["futureTopLevel"].(map[string]any)
	if !ok || future["keep"] != "me" {
		t.Fatalf("top-level unknown field lost: %#v", doc["futureTopLevel"])
	}

	modules := manifestModules(t, doc)
	video := manifestEntry(t, modules, "video")
	if video["note"] != "mine" {
		t.Fatalf("entry-level unknown field lost: %#v", video)
	}
	// Large integers must survive verbatim (json.Number, not float64 rounding:
	// 9007199254740993 is not representable as a float64).
	raw, err := os.ReadFile(filepath.Join(dir, "modules.json"))
	if err != nil {
		t.Fatalf("read raw: %v", err)
	}
	if !strings.Contains(string(raw), "9007199254740993") {
		t.Fatalf("large integer lost precision in the written file:\n%s", raw)
	}
	announcements := manifestEntry(t, modules, "announcements")
	if announcements["enabled"] != true {
		t.Fatalf("announcements entry altered: %#v", announcements)
	}
}

func TestWriteModulesManifestBacksUpCorruptFile(t *testing.T) {
	dir := t.TempDir()
	const corrupt = `{ "modules": { "video": `
	writeManifestFile(t, dir, corrupt)

	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}

	backups := backupFiles(t, dir)
	if len(backups) != 1 {
		t.Fatalf("expected exactly one backup, got %v", backups)
	}
	saved, err := os.ReadFile(backups[0])
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if string(saved) != corrupt {
		t.Fatalf("backup does not hold the original bytes: %q", saved)
	}

	video := manifestEntry(t, manifestModules(t, readManifestDoc(t, dir)), "video")
	if video["enabled"] != true {
		t.Fatalf("fresh manifest must start from the installer's choice: %#v", video)
	}
}

func TestWriteModulesManifestBacksUpNonObjectJSON(t *testing.T) {
	dir := t.TempDir()
	writeManifestFile(t, dir, `["not", "an", "object"]`)

	if err := WriteModulesManifest(dir, false); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	if len(backupFiles(t, dir)) != 1 {
		t.Fatalf("non-object JSON should be backed up, got %v", backupFiles(t, dir))
	}
	video := manifestEntry(t, manifestModules(t, readManifestDoc(t, dir)), "video")
	if video["enabled"] != false {
		t.Fatalf("expected a fresh manifest with video disabled: %#v", video)
	}
}

func TestWriteModulesManifestLeavesEmptyObjectFileAlone(t *testing.T) {
	dir := t.TempDir()
	writeManifestFile(t, dir, `{}`)

	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	if got := backupFiles(t, dir); len(got) != 0 {
		t.Fatalf("a valid (if empty) manifest must not be backed up: %v", got)
	}
	if manifestEntry(t, manifestModules(t, readManifestDoc(t, dir)), "video")["enabled"] != true {
		t.Fatal("video should be enabled")
	}
}
