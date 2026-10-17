package tasks

import (
	"os"
	"path/filepath"
	"testing"
)

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
