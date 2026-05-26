package screens

import (
	"strings"
	"testing"
)

func TestNewState_Defaults(t *testing.T) {
	s := NewState("v1.0.0")
	if s.Version != "v1.0.0" {
		t.Errorf("expected Version v1.0.0, got %q", s.Version)
	}
	if !s.WorkflowCanvas {
		t.Error("expected WorkflowCanvas to default to true")
	}
	if s.WorkflowPanopto || s.WorkflowCI || s.WorkflowRegistry || s.OptInPython {
		t.Error("expected non-default workflows to default to false")
	}
	if s.CanvasHost != "" {
		t.Errorf("expected CanvasHost default empty (no institution prefill), got %q", s.CanvasHost)
	}
	if !strings.Contains(s.InstallDir, "canvas-toolchain") {
		t.Errorf("expected InstallDir to contain 'canvas-toolchain', got %q", s.InstallDir)
	}
	if s.Mode != ModeFresh {
		t.Error("expected initial Mode to be ModeFresh")
	}
}
