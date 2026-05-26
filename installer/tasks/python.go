package tasks

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

const (
	pythonVersion         = "3.12.7"
	pythonWindowsURL      = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
	pythonMacUniversalURL = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-macos11.pkg"
)

func InstallPython(ctx context.Context) error {
	switch runtime.GOOS {
	case "windows":
		return installPythonWindows(ctx)
	case "darwin":
		return installPythonMac(ctx)
	default:
		return fmt.Errorf("automatic Python install not supported on %s — install manually", runtime.GOOS)
	}
}

func downloadTo(ctx context.Context, url, dest string) error {
	cli := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: HTTP %d", url, resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func installPythonWindows(ctx context.Context) error {
	tmp := filepath.Join(os.TempDir(), "python-installer.exe")
	defer os.Remove(tmp)
	if err := downloadTo(ctx, pythonWindowsURL, tmp); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, tmp, "/quiet", "PrependPath=1", "Include_test=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("python installer exited %v: %s", err, string(out))
	}
	return nil
}

func installPythonMac(ctx context.Context) error {
	tmp := filepath.Join(os.TempDir(), "python-installer.pkg")
	defer os.Remove(tmp)
	if err := downloadTo(ctx, pythonMacUniversalURL, tmp); err != nil {
		return err
	}
	script := fmt.Sprintf(`do shell script "installer -pkg %s -target /" with administrator privileges`, tmp)
	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("python installer failed: %v: %s", err, string(out))
	}
	return nil
}
