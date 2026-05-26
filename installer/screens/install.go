package screens

import (
	"context"
	"fmt"
	"os"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/payload"
	"github.com/Ryfter/canvas-toolchain/installer/tasks"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewInstallScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("Installing canvas-toolchain "+st.Version, fyne.TextAlignCenter, fyne.TextStyle{Bold: true})

	rows := []*ui.StatusRow{
		ui.NewStatusRow("Extract embedded source"),
		ui.NewStatusRow("Extract bundled Node runtime"),
		ui.NewStatusRow("Install npm dependencies"),
		ui.NewStatusRow("Build TypeScript packages"),
		ui.NewStatusRow("Write per-feature config files"),
		ui.NewStatusRow("Install optional Python 3"),
		ui.NewStatusRow("Wire Claude Desktop"),
		ui.NewStatusRow("Wire Claude Code CLI"),
		ui.NewStatusRow("Drop Updater shortcut"),
		ui.NewStatusRow("Write version marker"),
		ui.NewStatusRow("Validate credentials"),
	}
	rowsBox := container.NewVBox()
	for _, r := range rows {
		rowsBox.Add(r)
	}

	logArea := widget.NewMultiLineEntry()
	logArea.Wrapping = fyne.TextWrapOff
	logArea.SetMinRowsVisible(8)
	logBox := container.NewBorder(nil, nil, nil, nil, logArea)
	logBox.Hide()

	logToggle := ui.NewHoverButton("Show log", ui.ButtonDefault, func() {
		if logBox.Visible() {
			logBox.Hide()
		} else {
			logBox.Show()
		}
	})

	nextBtn := ui.NewHoverButton("Next", ui.ButtonPrimary, onNext)
	nextBtn.Disable()

	retryBtn := ui.NewHoverButton("Retry", ui.ButtonDefault, nil)
	retryBtn.Disable()

	backBtn := ui.NewHoverButton("Back", ui.ButtonDefault, onBack)
	backBtn.Disable()

	openDirBtn := ui.NewHoverButton("Open install dir", ui.ButtonDefault, func() {
		_ = openInFinder(st.InstallDir)
	})

	reportBtn := ui.NewHoverButton("Report issue", ui.ButtonDefault, func() {
		_ = openInBrowser("https://github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md")
	})

	logFn := func(line string) {
		logArea.SetText(logArea.Text + line)
	}

	steps := buildSteps(st, logFn)
	runner := &tasks.Runner{
		Steps: steps,
		OnUpdate: func(i int, name string, res tasks.StepResult) {
			if i >= len(rows) {
				return
			}
			switch res.Status {
			case tasks.StepRunning:
				rows[i].SetStatus(ui.StatusRunning, "")
			case tasks.StepOK:
				rows[i].SetStatus(ui.StatusOK, "")
			case tasks.StepWarn:
				msg := ""
				if res.Err != nil {
					msg = res.Err.Error()
				}
				rows[i].SetStatus(ui.StatusWarn, msg)
			case tasks.StepError:
				msg := ""
				if res.Err != nil {
					msg = res.Err.Error()
				}
				rows[i].SetStatus(ui.StatusError, msg)
				retryBtn.Enable()
				backBtn.Enable()
				if res.Err != nil {
					logFn("\n[" + name + " failed] " + res.Err.Error() + "\n")
				}
				dialog.ShowError(fmt.Errorf("%s failed: %v", name, res.Err), parent)
			}
		},
	}

	go func() {
		results := runner.Run(context.Background())
		allOK := true
		for _, r := range results {
			if r.Status == tasks.StepError {
				allOK = false
				break
			}
		}
		if allOK {
			nextBtn.Enable()
		}
	}()

	retryBtn.SetOnTapped(func() {
		retryBtn.Disable()
		for _, r := range rows {
			r.SetStatus(ui.StatusPending, "")
		}
		go runner.Run(context.Background())
	})

	bottom := container.NewBorder(nil, nil,
		container.NewHBox(backBtn, logToggle, retryBtn, openDirBtn, reportBtn, ui.NewHoverButton("Cancel", ui.ButtonDefault, parent.Close)),
		nextBtn,
	)
	return container.NewBorder(
		container.NewVBox(title, rowsBox),
		bottom,
		nil, nil,
		logBox,
	)
}

func buildSteps(st *State, logFn func(string)) []tasks.Step {
	np := tasks.ResolveNodePaths(st.InstallDir)
	ccServerJS := st.InstallDir + "/packages/command-and-control/dist/index.js"
	cdConfig := tasks.ClaudeDesktopConfigPath()
	ccConfig := tasks.ClaudeCodeConfigPath()
	updaterBin := st.InstallDir + "/canvas-toolchain-updater"

	return []tasks.Step{
		{Name: "Extract source", Run: func(ctx context.Context) error {
			_, err := tasks.ExtractTarGz(ctx, payload.PayloadTarGz, st.InstallDir)
			return err
		}},
		{Name: "Extract Node", Run: func(ctx context.Context) error {
			nodeDest := st.InstallDir + "/.node"
			if err := os.MkdirAll(nodeDest, 0o755); err != nil {
				return err
			}
			_, err := tasks.ExtractTarGz(ctx, payload.NodeTarGz, nodeDest)
			return err
		}},
		{Name: "npm install", Run: func(ctx context.Context) error {
			return tasks.RunNPM(ctx, np, st.InstallDir, []string{"install"}, logFn)
		}},
		{Name: "npm run build", Run: func(ctx context.Context) error {
			return tasks.RunNPM(ctx, np, st.InstallDir, []string{"run", "build"}, logFn)
		}},
		{Name: "Write configs", Warn: true, Run: func(ctx context.Context) error {
			if err := tasks.WriteAnthropicConfig(st.AnthropicAPIKey, ""); err != nil {
				return err
			}
			if err := tasks.WriteCanvasConfig(st.CanvasHost, st.CanvasToken); err != nil {
				return err
			}
			return tasks.WritePanoptoConfig(st.PanoptoDomain, st.PanoptoClientID, st.PanoptoSecret)
		}},
		{Name: "Python (optional)", Skip: func() bool { return !st.OptInPython }, Warn: true, Run: func(ctx context.Context) error {
			err := tasks.InstallPython(ctx)
			if err == nil {
				st.InstalledPython = true
			}
			return err
		}},
		{Name: "Claude Desktop", Warn: true, Run: func(ctx context.Context) error {
			if cdConfig == "" {
				return nil
			}
			if err := tasks.WriteHostConfig(cdConfig, np.Node, ccServerJS); err != nil {
				return err
			}
			st.InstalledClaudeDesktop = true
			return nil
		}},
		{Name: "Claude Code", Warn: true, Run: func(ctx context.Context) error {
			if ccConfig == "" {
				return nil
			}
			if err := tasks.WriteHostConfig(ccConfig, np.Node, ccServerJS); err != nil {
				return err
			}
			st.InstalledClaudeCode = true
			return nil
		}},
		{Name: "Updater shortcut", Warn: true, Run: func(ctx context.Context) error {
			return tasks.CreateUpdaterShortcuts(updaterBin, st.InstallDir)
		}},
		{Name: "Version marker", Run: func(ctx context.Context) error {
			return tasks.WriteVersionMarker(st.InstallDir, st.Version)
		}},
		{Name: "Validate credentials", Warn: true, Run: func(ctx context.Context) error {
			if st.AnthropicAPIKey != "" {
				err := tasks.ValidateAnthropic(ctx, st.AnthropicAPIKey, "")
				st.ValidationAnthropic = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			if st.CanvasHost != "" && st.CanvasToken != "" {
				err := tasks.ValidateCanvas(ctx, st.CanvasHost, st.CanvasToken)
				st.ValidationCanvas = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			if st.PanoptoDomain != "" && st.PanoptoClientID != "" && st.PanoptoSecret != "" {
				err := tasks.ValidatePanopto(ctx, st.PanoptoDomain, st.PanoptoClientID, st.PanoptoSecret)
				st.ValidationPanopto = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			return nil
		}},
	}
}

func errToString(e error) string {
	if e == nil {
		return ""
	}
	return e.Error()
}

var (
	openInFinder  = func(path string) error { return nil }
	openInBrowser = func(url string) error { return nil }
)
