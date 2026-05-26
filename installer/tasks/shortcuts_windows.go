//go:build windows

package tasks

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func init() {
	CreateUpdaterShortcuts = winCreateShortcuts
}

func winCreateShortcuts(updaterBin, _ string) error {
	home, _ := os.UserHomeDir()
	desktop := filepath.Join(home, "Desktop")
	startMenu := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs")
	for _, dir := range []string{desktop, startMenu} {
		if err := writeShortcut(filepath.Join(dir, "Canvas Toolchain Updater.lnk"), updaterBin); err != nil {
			return fmt.Errorf("shortcut at %s: %w", dir, err)
		}
	}
	return nil
}

func writeShortcut(lnkPath, target string) error {
	if err := os.MkdirAll(filepath.Dir(lnkPath), 0o755); err != nil {
		return err
	}
	script := fmt.Sprintf(
		`$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut(%q); $s.TargetPath = %q; $s.Save()`,
		lnkPath, target,
	)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell shortcut failed: %v: %s", err, string(out))
	}
	return nil
}
