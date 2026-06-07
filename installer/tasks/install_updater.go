package tasks

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// UpdaterBinaryName returns the on-disk name of the updater binary for the
// current OS (with a .exe suffix on Windows).
func UpdaterBinaryName() string {
	if runtime.GOOS == "windows" {
		return "canvas-toolchain-updater.exe"
	}
	return "canvas-toolchain-updater"
}

// InstallUpdater writes the embedded updater binary into installDir and returns
// its full path. The caller passes payload.UpdaterBin; in local dev builds that
// is empty, so we return an error rather than create a shortcut to an empty
// (non-runnable) file.
func InstallUpdater(installDir string, updaterData []byte) (string, error) {
	if len(updaterData) == 0 {
		return "", fmt.Errorf("embedded updater binary is empty (0 bytes) — this is a local dev build with no packed updater; CI release builds populate installer/payload/updater-bin before go build")
	}
	dest := filepath.Join(installDir, UpdaterBinaryName())
	if err := os.WriteFile(dest, updaterData, 0o755); err != nil {
		return "", fmt.Errorf("write updater binary to %s: %w", dest, err)
	}
	return dest, nil
}
