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

	var goWelcome, goWorkflows, goInstall, goSummary func()
	goWelcome = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWelcomeScreen(w, st, goWorkflowsOrInstall(st, goWorkflows, goInstall))}
		stack.Refresh()
	}
	goWorkflows = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWorkflowsScreen(w, st, goInstall, goWelcome)}
		stack.Refresh()
	}
	goInstall = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewInstallScreen(w, st, goSummary, goInstallBack(st, goWelcome, goWorkflows))}
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

// goInstallBack returns the install screen's Back target. An update skips the
// workflows screen, so it returns to the welcome screen; a fresh install goes
// back one step, to the workflows screen.
func goInstallBack(st *screens.State, welcome, workflows func()) func() {
	return func() {
		if st.Mode == screens.ModeUpdate {
			welcome()
		} else {
			workflows()
		}
	}
}
