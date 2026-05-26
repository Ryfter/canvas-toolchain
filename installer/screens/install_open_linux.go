//go:build linux

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("xdg-open", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("xdg-open", url).Start() }
}
