package tasks

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestInstallUpdaterWritesPlatformBinary(t *testing.T) {
	dir := t.TempDir()
	data := []byte("fake-updater-binary-bytes")

	path, err := InstallUpdater(dir, data)
	if err != nil {
		t.Fatalf("InstallUpdater: %v", err)
	}

	wantName := "canvas-toolchain-updater"
	if runtime.GOOS == "windows" {
		wantName += ".exe"
	}
	if got := filepath.Base(path); got != wantName {
		t.Errorf("binary name = %q, want %q", got, wantName)
	}
	if filepath.Dir(path) != dir {
		t.Errorf("binary dir = %q, want %q", filepath.Dir(path), dir)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back written binary: %v", err)
	}
	if string(got) != string(data) {
		t.Errorf("written content mismatch: got %q, want %q", got, data)
	}

	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		if info.Mode().Perm()&0o100 == 0 {
			t.Errorf("binary is not executable: mode %v", info.Mode().Perm())
		}
	}
}

func TestInstallUpdaterRejectsEmptyData(t *testing.T) {
	dir := t.TempDir()
	if _, err := InstallUpdater(dir, nil); err == nil {
		t.Error("expected error for empty updater data (dev build), got nil")
	}
}
