//go:build windows

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("explorer.exe", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("cmd.exe", "/C", "start", url).Start() }
}
