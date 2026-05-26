package screens

import (
	"os"
	"path/filepath"
	"runtime"
)

type InstallMode int

const (
	ModeFresh InstallMode = iota
	ModeUpdate
)

type State struct {
	InstallDir string
	Mode       InstallMode

	WorkflowCanvas   bool
	WorkflowPanopto  bool
	WorkflowCI       bool
	WorkflowRegistry bool
	OptInPython      bool

	AnthropicAPIKey string
	CanvasHost      string
	CanvasToken     string
	PanoptoDomain   string
	PanoptoClientID string
	PanoptoSecret   string

	InstalledClaudeDesktop bool
	InstalledClaudeCode    bool
	InstalledPython        bool
	ValidationAnthropic    StepResult
	ValidationCanvas       StepResult
	ValidationPanopto      StepResult

	Version string
}

type StepResult struct {
	Attempted bool
	OK        bool
	Message   string
}

func DefaultInstallDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(home, "canvas-toolchain")
	}
	return filepath.Join(home, "canvas-toolchain")
}

func NewState(version string) *State {
	return &State{
		Version:        version,
		InstallDir:     DefaultInstallDir(),
		Mode:           ModeFresh,
		WorkflowCanvas: true,
		CanvasHost:     "bsu.instructure.com",
	}
}
