//go:build darwin

package tasks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func init() {
	CreateUpdaterShortcuts = macCreateShortcuts
}

func macCreateShortcuts(updaterBin, _ string) error {
	appPath := "/Applications/Canvas Toolchain Updater.app"
	contents := filepath.Join(appPath, "Contents")
	macos := filepath.Join(contents, "MacOS")
	if err := os.MkdirAll(macos, 0o755); err != nil {
		return err
	}
	dst := filepath.Join(macos, "canvas-toolchain-updater")
	if err := copyFileMode(updaterBin, dst, 0o755); err != nil {
		return err
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>canvas-toolchain-updater</string>
  <key>CFBundleIdentifier</key>
  <string>io.canvas-toolchain.updater</string>
  <key>CFBundleName</key>
  <string>Canvas Toolchain Updater</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`
	return os.WriteFile(filepath.Join(contents, "Info.plist"), []byte(plist), 0o644)
}

func copyFileMode(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return fmt.Errorf("copy: %w", err)
	}
	return nil
}
