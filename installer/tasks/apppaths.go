package tasks

import (
	"os"
	"runtime"
	"strings"
)

// Go twin of packages/shared-types/src/app-paths.ts (#200, spec section 4.1).
// The installer and the Node processes must resolve the same C&C home at every
// point of the upgrade, so both are tested against one shared JSON fixture
// (packages/shared-types/tests/fixtures/app-paths-cases.json). Change the two
// resolvers and the fixture together.
//
// The installer writes no secrets, so only config and data are exposed.

// AppPaths mirrors the TypeScript AppPaths (minus secrets).
type AppPaths struct {
	Config string
	Data   string
	Source string // "env" or "default"
}

// AppPathEnv carries injectable inputs. Zero values mean "use the real
// process": runtime.GOOS, os.Environ, os.UserHomeDir, the real filesystem.
type AppPathEnv struct {
	Platform string            // "darwin", "linux", "windows" or "win32"
	Env      map[string]string // nil means the process environment
	Homedir  string
	// LegacyExists / NewExists stand in for filesystem probes; nil probes the disk.
	LegacyExists *bool
	NewExists    *bool
	// IgnoreUpgradeWindow resolves the new homes even inside the upgrade window.
	IgnoreUpgradeWindow bool
}

type appMeta struct{ sub, legacy, envVar string }

var appMetas = map[string]appMeta{
	"cc":  {"CommandAndControl", ".command-and-control", "CC_HOME"},
	"cds": {"CanvasDesignStudio", ".canvas-design-mcp", "CANVAS_DESIGN_HOME"},
	"ci":  {"CurriculumIntelligence", ".curriculum-intelligence", "CURRICULUM_INTELLIGENCE_HOME"},
}

func joinPath(sep string, parts ...string) string {
	out := parts[0]
	for _, p := range parts[1:] {
		out = strings.TrimRight(out, "/\\") + sep + p
	}
	return out
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// ResolveAppPaths resolves an app's config and data homes. app is "cc", "cds"
// or "ci"; an unknown app panics (programmer error).
func ResolveAppPaths(app string, o AppPathEnv) AppPaths {
	meta, ok := appMetas[app]
	if !ok {
		panic("apppaths: unknown app " + app)
	}
	platform := o.Platform
	if platform == "" {
		platform = runtime.GOOS
	}
	getenv := os.Getenv
	if o.Env != nil {
		getenv = func(k string) string { return o.Env[k] }
	}
	home := o.Homedir
	if home == "" {
		home, _ = os.UserHomeDir()
	}
	nonBlank := func(k string) string { return strings.TrimSpace(getenv(k)) }

	// An override means "one folder for everything".
	if v := nonBlank(meta.envVar); v != "" {
		return AppPaths{Config: v, Data: v, Source: "env"}
	}

	win := platform == "windows" || platform == "win32"
	if !win {
		legacy := joinPath("/", home, meta.legacy)
		return AppPaths{Config: legacy, Data: legacy, Source: "default"}
	}

	const sep = `\`
	legacy := joinPath(sep, home, meta.legacy)
	roaming := nonBlank("APPDATA")
	if roaming == "" {
		roaming = joinPath(sep, home, "AppData", "Roaming")
	}
	local := nonBlank("LOCALAPPDATA")
	if local == "" {
		local = joinPath(sep, home, "AppData", "Local")
	}
	config := joinPath(sep, roaming, "CanvasToolchain", meta.sub)
	data := joinPath(sep, local, "CanvasToolchain", meta.sub)

	// Upgrade window: legacy present and new config home absent means the
	// legacy folder stays authoritative for every root.
	if !o.IgnoreUpgradeWindow {
		legacyExists := dirExists(legacy)
		if o.LegacyExists != nil {
			legacyExists = *o.LegacyExists
		}
		if legacyExists {
			newExists := false
			if o.NewExists != nil {
				newExists = *o.NewExists
			} else {
				newExists = dirExists(config)
			}
			if !newExists {
				return AppPaths{Config: legacy, Data: legacy, Source: "default"}
			}
		}
	}
	return AppPaths{Config: config, Data: data, Source: "default"}
}
