package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"

	"github.com/Ryfter/canvas-toolchain/installer/screens"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.installer")
	a.Settings().SetTheme(ui.InstallerTheme{})

	w := a.NewWindow("Canvas Toolchain Installer " + Version)
	w.Resize(fyne.NewSize(720, 600))

	st := screens.NewState(Version)
	stack := container.NewStack()

	var goWelcome, goWorkflows, goCredentials, goInstall, goSummary func()
	goWelcome = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWelcomeScreen(w, st, goWorkflowsOrInstall(st, goWorkflows, goInstall))}
		stack.Refresh()
	}
	goWorkflows = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWorkflowsScreen(w, st, goCredentials, goWelcome)}
		stack.Refresh()
	}
	goCredentials = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewCredentialsScreen(w, st, goInstall, goWorkflows)}
		stack.Refresh()
	}
	goInstall = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewInstallScreen(w, st, goSummary, goCredentials)}
		stack.Refresh()
	}
	goSummary = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewSummaryScreen(w, st, w.Close)}
		stack.Refresh()
	}

	goWelcome()
	w.SetContent(stack)
	w.ShowAndRun()
}

func goWorkflowsOrInstall(st *screens.State, workflows, install func()) func() {
	return func() {
		if st.Mode == screens.ModeUpdate {
			install()
		} else {
			workflows()
		}
	}
}
