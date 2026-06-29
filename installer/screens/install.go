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

	var rows []*ui.StatusRow
	for _, label := range installRowLabels() {
		rows = append(rows, ui.NewStatusRow(label))
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

func writeSelectedHosts(st *State, nodeBin, ccServerJS string) error {
	for _, h := range tasks.SupportedHosts() {
		if !st.ConnectHosts[h.ID] {
			continue
		}
		path := h.ResolvePath()
		if path == "" {
			continue
		}
		if err := tasks.WriteHostConfigForPath(h.Format, path, nodeBin, ccServerJS); err != nil {
			return err
		}
		st.WiredHosts[h.ID] = true
	}
	return nil
}

func buildSteps(st *State, logFn func(string)) []tasks.Step {
	np := tasks.ResolveNodePaths(st.InstallDir)
	ccServerJS := st.InstallDir + "/packages/command-and-control/dist/index.js"

	return []tasks.Step{
		{Name: "Extract source", Run: func(ctx context.Context) error {
			if len(payload.PayloadTarGz) == 0 {
				return fmt.Errorf("embedded payload is empty (0 bytes) — this is a local dev build with no packed source. CI release builds populate this file at build time. To smoke-test the full install path locally, see installer/README.md \"Local dev (real payload)\"")
			}
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
		{Name: "Write module manifest", Warn: true, Run: func(ctx context.Context) error {
			return tasks.WriteModulesManifest(tasks.CcHomePath(), st.WorkflowPanopto)
		}},
		{Name: "Python (optional)", Skip: func() bool { return !st.OptInPython }, Warn: true, Run: func(ctx context.Context) error {
			err := tasks.InstallPython(ctx)
			if err == nil {
				st.InstalledPython = true
			}
			return err
		}},
		{Name: "Connect MCP hosts", Warn: true, Run: func(ctx context.Context) error {
			return writeSelectedHosts(st, np.Node, ccServerJS)
		}},
		{Name: "Updater shortcut", Warn: true, Run: func(ctx context.Context) error {
			updaterPath, err := tasks.InstallUpdater(st.InstallDir, payload.UpdaterBin)
			if err != nil {
				return err
			}
			return tasks.CreateUpdaterShortcuts(updaterPath, st.InstallDir)
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

func installRowLabels() []string {
	return []string{
		"Extract embedded source",
		"Extract bundled Node runtime",
		"Install npm dependencies",
		"Build TypeScript packages",
		"Write per-feature config files",
		"Write module manifest",
		"Install optional Python 3",
		"Connect MCP-capable apps",
		"Install updater + shortcut",
		"Write version marker",
		"Validate credentials",
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
