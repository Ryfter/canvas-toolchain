package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// minFixtureCases guards against the fixture silently shrinking or failing to parse.
const minFixtureCases = 75

type appPathCase struct {
	Name                string            `json:"name"`
	App                 string            `json:"app"`
	Platform            string            `json:"platform"`
	Env                 map[string]string `json:"env"`
	Homedir             string            `json:"homedir"`
	LegacyExists        bool              `json:"legacyExists"`
	NewExists           bool              `json:"newExists"`
	IgnoreUpgradeWindow bool              `json:"ignoreUpgradeWindow"`
	ExpectConfig        string            `json:"expectConfig"`
	ExpectData          string            `json:"expectData"`
	ExpectSource        string            `json:"expectSource"`
}

func fixturePath(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test file")
	}
	// installer/tasks -> repo root
	return filepath.Join(filepath.Dir(file), "..", "..", "packages", "shared-types", "tests", "fixtures", "app-paths-cases.json")
}

func slash(s string) string { return strings.ReplaceAll(s, `\`, "/") }

func TestAppPathsSharedFixture(t *testing.T) {
	raw, err := os.ReadFile(fixturePath(t))
	if err != nil {
		t.Fatalf("shared fixture missing: %v", err)
	}
	var f struct {
		Cases []appPathCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < minFixtureCases {
		t.Fatalf("fixture has %d cases, want at least %d", len(f.Cases), minFixtureCases)
	}
	for _, c := range f.Cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			got := ResolveAppPaths(c.App, AppPathEnv{
				Platform:            c.Platform,
				Env:                 c.Env,
				Homedir:             c.Homedir,
				LegacyExists:        &c.LegacyExists,
				NewExists:           &c.NewExists,
				IgnoreUpgradeWindow: c.IgnoreUpgradeWindow,
			})
			if slash(got.Config) != c.ExpectConfig {
				t.Errorf("config = %q, want %q", got.Config, c.ExpectConfig)
			}
			if slash(got.Data) != c.ExpectData {
				t.Errorf("data = %q, want %q", got.Data, c.ExpectData)
			}
			if got.Source != c.ExpectSource {
				t.Errorf("source = %q, want %q", got.Source, c.ExpectSource)
			}
		})
	}
}

func TestCcHomePathDelegates(t *testing.T) {
	t.Setenv("CC_HOME", "/srv/delegated")
	if got := CcHomePath(); got != "/srv/delegated" {
		t.Fatalf("CcHomePath = %q", got)
	}
}
