package screens

import (
	"context"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/tasks"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewWorkflowsScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("Choose your workflows", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	hint := widget.NewLabel("All canvas-toolchain code is installed regardless of selection. Selecting Panopto adds API credential fields on the next screen; the other selections are informational.")
	hint.Wrapping = fyne.TextWrapWord

	canvasCheck := widget.NewCheck("Canvas course management — generate, review, publish pages", func(b bool) { st.WorkflowCanvas = b })
	canvasCheck.SetChecked(st.WorkflowCanvas)

	panoptoCheck := widget.NewCheck("Panopto pipeline — bulk transcript download + enrichment", func(b bool) { st.WorkflowPanopto = b })
	panoptoCheck.SetChecked(st.WorkflowPanopto)

	ciCheck := widget.NewCheck("Curriculum Intelligence — semester comparison + course analysis", func(b bool) { st.WorkflowCI = b })
	ciCheck.SetChecked(st.WorkflowCI)

	registryCheck := widget.NewCheck("Registry — multi-course tracking", func(b bool) { st.WorkflowRegistry = b })
	registryCheck.SetChecked(st.WorkflowRegistry)

	detected := tasks.DetectConnectHosts()
	st.ConnectHosts = detected
	hostChecks := []fyne.CanvasObject{
		widget.NewLabelWithStyle("Connect to these apps", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		func() fyne.CanvasObject {
			l := widget.NewLabel("Detected MCP-capable apps are pre-checked. Untick any you don't want canvas-toolchain added to.")
			l.Wrapping = fyne.TextWrapWord
			return l
		}(),
	}
	for _, h := range tasks.SupportedHosts() {
		host := h // capture
		label := host.DisplayName
		if !detected[host.ID] {
			label += " (not detected)"
		}
		check := widget.NewCheck(label, func(b bool) { st.ConnectHosts[host.ID] = b })
		check.SetChecked(detected[host.ID])
		hostChecks = append(hostChecks, check)
	}
	hostSection := container.NewVBox(hostChecks...)

	pythonCheck := widget.NewCheck("Install Python 3 (needed later for Canvas Backup — not configured here)", func(b bool) { st.OptInPython = b })
	pythonCheck.SetChecked(st.OptInPython)

	pythonStatus := ui.NewStatusRow("Checking for Python 3 on this machine…")
	pythonStatus.SetStatus(ui.StatusRunning, "")

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		version, found := tasks.DetectPython(ctx)
		if found {
			pythonStatus.SetStatus(ui.StatusOK, version+" detected — no install needed")
			st.OptInPython = false
			pythonCheck.SetChecked(false)
			return
		}
		pythonStatus.SetStatus(ui.StatusWarn, "Not detected — checked the install box for you")
		st.OptInPython = true
		pythonCheck.SetChecked(true)
	}()

	modulesLabel := widget.NewLabelWithStyle("Additional modules", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	modulesHint := widget.NewLabel("These install later through Claude — checking one just queues the request. " +
		"Next time you open Claude it will offer to install them, or just ask: \"install the <module> module\".")
	modulesHint.Wrapping = fyne.TextWrapWord
	modulesStatus := ui.NewStatusRow("Checking the module catalog…")
	modulesStatus.SetStatus(ui.StatusRunning, "")
	modulesBox := container.NewVBox()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		mods, err := tasks.FetchModuleCatalog(ctx, tasks.ModuleCatalogURL)
		if err != nil {
			modulesStatus.SetStatus(ui.StatusWarn, "Module catalog unavailable — you can install modules later by asking Claude.")
			return
		}
		if len(mods) == 0 {
			modulesStatus.SetStatus(ui.StatusOK, "No additional modules published yet.")
			return
		}
		modulesStatus.SetStatus(ui.StatusOK, "Catalog loaded")
		for _, m := range mods {
			mod := m // capture
			check := widget.NewCheck(mod.Name+" — "+mod.Description, func(b bool) { st.RequestedModules[mod.ID] = b })
			check.SetChecked(st.RequestedModules[mod.ID])
			modulesBox.Add(check)
		}
		modulesBox.Refresh()
	}()

	form := container.NewVBox(
		title,
		hint,
		widget.NewSeparator(),
		canvasCheck,
		panoptoCheck,
		ciCheck,
		registryCheck,
		widget.NewSeparator(),
		hostSection,
		widget.NewSeparator(),
		modulesLabel,
		modulesHint,
		modulesStatus,
		modulesBox,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Optional extras", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		pythonCheck,
		pythonStatus,
	)

	back := ui.NewHoverButton("Back", ui.ButtonDefault, onBack)
	next := ui.NewHoverButton("Next", ui.ButtonPrimary, onNext)
	bottom := container.NewBorder(nil, nil, container.NewHBox(back, ui.NewHoverButton("Cancel", ui.ButtonDefault, parent.Close)), next)
	return container.NewBorder(form, bottom, nil, nil)
}
