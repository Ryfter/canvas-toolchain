//go:build windows

package screens

import "os/exec"

func init() {
	launchClaudeDesktop = func() error {
		return exec.Command("cmd.exe", "/C", "start", "claude://").Start()
	}
}
