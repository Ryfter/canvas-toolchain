package main

import "testing"

func TestLaunchInstallerCmd(t *testing.T) {
	// macOS: a .pkg is not executable; it must be handed to `open` so the
	// system package installer UI launches it. Executing it directly fails.
	mac := launchInstallerCmd("darwin", "/tmp/canvas-toolchain-installer-macos-arm64.pkg")
	if len(mac.Args) != 2 || mac.Args[0] != "open" || mac.Args[1] != "/tmp/canvas-toolchain-installer-macos-arm64.pkg" {
		t.Errorf("darwin: want [open <pkg>], got %v", mac.Args)
	}

	// Windows: the asset is a self-contained .exe — run it directly.
	win := launchInstallerCmd("windows", `C:\Temp\canvas-toolchain-installer-windows-x64.exe`)
	if len(win.Args) != 1 || win.Args[0] != `C:\Temp\canvas-toolchain-installer-windows-x64.exe` {
		t.Errorf("windows: want [<exe>], got %v", win.Args)
	}
}
