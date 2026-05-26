package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/update"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.updater")
	w := a.NewWindow("Canvas Toolchain Updater")

	statusLabel := widget.NewLabel("Checking for updates…")
	content := container.NewVBox(statusLabel)
	w.SetContent(content)
	w.Resize(fyne.NewSize(420, 180))

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		installDir := findInstallDir()
		installed := readInstalledVersion(installDir)

		release, err := update.LatestRelease(ctx)
		if err != nil || release == nil {
			statusLabel.SetText("Couldn't check for updates — try again later.")
			return
		}
		latest := strings.TrimPrefix(release.TagName, "v")
		if compareVersions(installed, latest) >= 0 {
			statusLabel.SetText(fmt.Sprintf("Canvas Toolchain is up to date (v%s).", installed))
			return
		}
		statusLabel.SetText(fmt.Sprintf("Update available: v%s → v%s.", installed, latest))
		updateBtn := widget.NewButton("Update now", func() {
			if err := downloadAndRun(ctx, release); err != nil {
				dialog.ShowError(err, w)
				return
			}
			w.Close()
		})
		skipBtn := widget.NewButton("Skip", w.Close)
		content.Add(container.NewHBox(updateBtn, skipBtn))
	}()

	w.ShowAndRun()
}

func findInstallDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	if runtime.GOOS == "darwin" {
		side := filepath.Join(dir, "install_dir.txt")
		if data, err := os.ReadFile(side); err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	return dir
}

func readInstalledVersion(installDir string) string {
	if installDir == "" {
		return "0.0.0"
	}
	data, err := os.ReadFile(filepath.Join(installDir, ".canvas-toolchain-version"))
	if err != nil {
		return "0.0.0"
	}
	return strings.TrimPrefix(strings.TrimSpace(string(data)), "v")
}

func compareVersions(a, b string) int {
	pa := splitVer(a)
	pb := splitVer(b)
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

func splitVer(v string) [3]int {
	var out [3]int
	parts := strings.SplitN(v, ".", 3)
	for i := 0; i < len(parts) && i < 3; i++ {
		_, _ = fmt.Sscanf(parts[i], "%d", &out[i])
	}
	return out
}

func downloadAndRun(ctx context.Context, r *update.Release) error {
	assetName := assetForCurrentOS()
	var downloadURL string
	for _, a := range r.Assets {
		if a.Name == assetName {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return fmt.Errorf("no installer asset for %s/%s in release %s", runtime.GOOS, runtime.GOARCH, r.TagName)
	}
	tmp := filepath.Join(os.TempDir(), assetName)
	if err := download(ctx, downloadURL, tmp); err != nil {
		return err
	}
	return exec.Command(tmp).Start()
}

func assetForCurrentOS() string {
	switch runtime.GOOS {
	case "windows":
		return "canvas-toolchain-installer-windows-x64.exe"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return "canvas-toolchain-installer-macos-arm64.pkg"
		}
		return ""
	}
	return ""
}

func download(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	cli := &http.Client{Timeout: 5 * time.Minute}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download HTTP %d", resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}
