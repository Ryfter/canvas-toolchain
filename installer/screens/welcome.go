package screens

import (
	"fmt"
	"os"
	"path/filepath"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

const MinDiskBytes uint64 = 500 * 1024 * 1024

func NewWelcomeScreen(parent fyne.Window, st *State, onNext func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle(
		"Canvas Toolchain Installer "+st.Version,
		fyne.TextAlignCenter,
		fyne.TextStyle{Bold: true},
	)
	intro := widget.NewLabel("This installer will set up canvas-toolchain on your machine, including all dependencies. You can change the install location below.")
	intro.Wrapping = fyne.TextWrapWord

	diskRow := ui.NewStatusRow("Disk space (500 MB free required)")

	pathEntry := widget.NewEntry()
	pathEntry.SetText(st.InstallDir)
	pathEntry.OnChanged = func(s string) {
		st.InstallDir = s
		st.Mode = detectMode(s)
		refreshDiskRow(s, diskRow)
	}

	browseButton := ui.NewHoverButton("Browse…", ui.ButtonDefault, func() {
		dialog.ShowFolderOpen(func(uri fyne.ListableURI, err error) {
			if err != nil || uri == nil {
				return
			}
			pathEntry.SetText(filepath.Join(uri.Path(), "canvas-toolchain"))
		}, parent)
	})

	advancedExpander := widget.NewAccordion(
		widget.NewAccordionItem("Advanced",
			container.NewVBox(
				ui.NewHoverButton("Reset to default", ui.ButtonDefault, func() {
					pathEntry.SetText(DefaultInstallDir())
				}),
				widget.NewLabel("The installer creates this directory if it doesn't exist."),
			),
		),
	)

	nextButton := ui.NewHoverButton("Next", ui.ButtonPrimary, func() {
		if !checkDiskSpace(st.InstallDir) {
			dialog.ShowError(fmt.Errorf("not enough disk space at %s", st.InstallDir), parent)
			return
		}
		st.Mode = detectMode(st.InstallDir)
		onNext()
	})

	refreshDiskRow(st.InstallDir, diskRow)

	form := container.NewVBox(
		title,
		intro,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Prerequisites", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		diskRow,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Install location", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		container.NewBorder(nil, nil, nil, browseButton, pathEntry),
		advancedExpander,
	)

	bottom := container.NewBorder(nil, nil, ui.NewHoverButton("Cancel", ui.ButtonDefault, parent.Close), nextButton)
	return container.NewBorder(form, bottom, nil, nil)
}

func refreshDiskRow(path string, row *ui.StatusRow) {
	free, err := freeBytes(path)
	if err != nil {
		row.SetStatus(ui.StatusError, fmt.Sprintf("could not check: %v", err))
		return
	}
	if free < MinDiskBytes {
		row.SetStatus(ui.StatusError, fmt.Sprintf("only %d MB free", free/1024/1024))
		return
	}
	row.SetStatus(ui.StatusOK, fmt.Sprintf("%d MB free", free/1024/1024))
}

func checkDiskSpace(path string) bool {
	free, err := freeBytes(path)
	if err != nil {
		return false
	}
	return free >= MinDiskBytes
}

func detectMode(path string) InstallMode {
	if _, err := os.Stat(filepath.Join(path, ".canvas-toolchain-version")); err == nil {
		return ModeUpdate
	}
	return ModeFresh
}

func freeBytes(path string) (uint64, error) {
	probe := path
	for {
		if _, err := os.Stat(probe); err == nil {
			break
		}
		parent := filepath.Dir(probe)
		if parent == probe {
			return 0, fmt.Errorf("no existing ancestor for %s", path)
		}
		probe = parent
	}
	return diskFree(probe)
}

var diskFree func(path string) (uint64, error)
