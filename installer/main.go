package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/widget"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.installer")
	w := a.NewWindow("Canvas Toolchain Installer " + Version)
	w.Resize(fyne.NewSize(720, 540))
	w.SetContent(widget.NewLabel("Canvas Toolchain Installer " + Version))
	w.ShowAndRun()
}
