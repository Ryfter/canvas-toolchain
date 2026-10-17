package scripts

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

// packPayloadScript is the script under test, relative to this package's
// directory (Go runs each package's tests from that directory).
const packPayloadScript = "pack-payload.sh"

func repoRoot(t *testing.T) string {
	t.Helper()
	out, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Skipf("not in a git worktree: %v", err)
	}
	return strings.TrimSpace(string(out))
}

// The release workflow only ever runs installer/scripts under bash on Linux and
// macOS (the Windows installer is cross-compiled on ubuntu-latest), so these
// tests skip rather than guess at Git Bash behaviour.
func requirePOSIX(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("installer/scripts run under bash on the Linux/macOS release legs only")
	}
}

func TestPackPayloadScript_IsValidShell(t *testing.T) {
	requirePOSIX(t)
	if out, err := exec.Command("bash", "-n", packPayloadScript).CombinedOutput(); err != nil {
		t.Fatalf("bash -n %s: %v\n%s", packPayloadScript, err, out)
	}
}

// shellcheck catches what a syntax check cannot. It is not installed
// everywhere, so this is a no-op without it — TestPackPayloadScript_PacksATree
// still executes the real script in that case.
func TestPackPayloadScript_Shellcheck(t *testing.T) {
	requirePOSIX(t)
	if _, err := exec.LookPath("shellcheck"); err != nil {
		t.Skip("shellcheck is not installed")
	}
	if out, err := exec.Command("shellcheck", packPayloadScript).CombinedOutput(); err != nil {
		t.Errorf("shellcheck reported findings in %s:\n%s", packPayloadScript, out)
	}
}

// The packed payload is what every professor installs, so this runs the real
// script into a temp file and reads the archive back: the root manifests and
// the packages tree are present, and the packed package.json is the repo's with
// exactly one thing removed — the dev-only `prepare` script. npm runs
// `prepare` on every install, so shipping it would build TypeScript on the
// professor's laptop, the work D3 phase 2 exists to remove.
func TestPackPayloadScript_PacksATree(t *testing.T) {
	requirePOSIX(t)
	root := repoRoot(t)
	out := filepath.Join(t.TempDir(), "installer-payload.tar.gz")

	cmd := exec.Command("bash", packPayloadScript)
	cmd.Env = append(os.Environ(),
		"PACK_PAYLOAD_SKIP_BUILD=1",
		"PACK_PAYLOAD_OUT="+out,
	)
	if combined, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("pack-payload.sh failed: %v\n%s", err, combined)
	}

	names, contents := scanTarGz(t, out, map[string]bool{"package.json": true})

	for _, want := range []string{"package.json", "package-lock.json", "tsconfig.base.json"} {
		if !names[want] {
			t.Errorf("payload has no %s entry", want)
		}
	}
	hasPackages := false
	for name := range names {
		if strings.HasPrefix(name, "packages/") {
			hasPackages = true
			break
		}
	}
	if !hasPackages {
		t.Error("payload has no packages/ entries")
	}

	repoPkgRaw, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		t.Fatalf("read repo package.json: %v", err)
	}
	var want, got map[string]any
	if err := json.Unmarshal(repoPkgRaw, &want); err != nil {
		t.Fatalf("repo package.json is not JSON: %v", err)
	}
	if err := json.Unmarshal([]byte(contents["package.json"]), &got); err != nil {
		t.Fatalf("packed package.json is not JSON: %v", err)
	}

	scripts, ok := want["scripts"].(map[string]any)
	if !ok {
		t.Fatal("repo package.json has no scripts object")
	}
	if _, present := scripts["prepare"]; !present {
		t.Fatal("repo package.json has no prepare script — the strip this guards is moot")
	}
	delete(scripts, "prepare")

	if !reflect.DeepEqual(want, got) {
		t.Errorf("packed package.json must be the repo's with only `prepare` removed:\nwant: %v\ngot:  %v", want, got)
	}
}

// scanTarGz returns every entry name in the archive (as a set) and the contents
// of only the names asked for, so a full payload never lands in memory.
func scanTarGz(t *testing.T, path string, readContent map[string]bool) (map[string]bool, map[string]string) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open payload: %v", err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("payload is not gzip: %v", err)
	}
	defer gz.Close()

	names := map[string]bool{}
	contents := map[string]string{}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("read payload tar: %v", err)
		}
		names[hdr.Name] = true
		if hdr.Typeflag != tar.TypeReg || !readContent[hdr.Name] {
			continue
		}
		raw, err := io.ReadAll(tr)
		if err != nil {
			t.Fatalf("read %s from payload: %v", hdr.Name, err)
		}
		contents[hdr.Name] = string(raw)
	}
	return names, contents
}
