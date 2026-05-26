//go:build darwin

package screens

import "os/exec"

func init() {
	launchClaudeDesktop = func() error {
		return exec.Command("open", "-a", "Claude").Start()
	}
}
