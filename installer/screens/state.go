package screens

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
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

	InstalledPython bool
	ConnectHosts    map[string]bool
	WiredHosts      map[string]bool
	// requestedModules holds catalog module ids the user asked to have
	// installed via chat after setup (written as a pending-request file).
	// Unexported (#122) so access goes only through SetRequestedModule /
	// RequestedModuleIDs / requestedModule — the catalog goroutine in
	// workflows.go and the install step in install.go both touch this map
	// from different goroutines, so it needs requestedModulesMu.
	requestedModules    map[string]bool
	requestedModulesMu  sync.Mutex
	ValidationAnthropic StepResult
	ValidationCanvas    StepResult
	ValidationPanopto   StepResult

	Version string
}

// SetRequestedModule records/clears a module-picker choice. Safe from any goroutine.
func (s *State) SetRequestedModule(id string, want bool) {
	s.requestedModulesMu.Lock()
	defer s.requestedModulesMu.Unlock()
	s.requestedModules[id] = want
}

// RequestedModuleIDs returns the sorted ids currently checked. Safe from any goroutine.
func (s *State) RequestedModuleIDs() []string {
	s.requestedModulesMu.Lock()
	defer s.requestedModulesMu.Unlock()
	ids := make([]string, 0, len(s.requestedModules))
	for id, want := range s.requestedModules {
		if want {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// requestedModule reads one picker choice. Safe from any goroutine.
func (s *State) requestedModule(id string) bool {
	s.requestedModulesMu.Lock()
	defer s.requestedModulesMu.Unlock()
	return s.requestedModules[id]
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
		Version:          version,
		InstallDir:       DefaultInstallDir(),
		Mode:             ModeFresh,
		WorkflowCanvas:   true,
		ConnectHosts:     map[string]bool{},
		WiredHosts:       map[string]bool{},
		requestedModules: map[string]bool{},
	}
}
