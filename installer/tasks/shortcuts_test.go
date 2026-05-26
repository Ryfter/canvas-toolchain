package tasks

import (
	"runtime"
	"testing"
)

func TestCreateUpdaterShortcuts_NoOpOnLinux(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("linux only")
	}
	if err := CreateUpdaterShortcuts("/nonexistent", "/nonexistent"); err != nil {
		t.Errorf("expected no-op on linux to succeed, got %v", err)
	}
}
