//go:build darwin

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("open", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("open", url).Start() }
}
