package screens

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

func NewWorkflowsScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("Choose your workflows", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	hint := widget.NewLabel("All canvas-toolchain code is installed regardless of selection. Your choices affect which API credentials are requested next and which features the summary highlights.")
	hint.Wrapping = fyne.TextWrapWord

	canvasCheck := widget.NewCheck("Canvas course management — generate, review, publish pages", func(b bool) { st.WorkflowCanvas = b })
	canvasCheck.SetChecked(st.WorkflowCanvas)

	panoptoCheck := widget.NewCheck("Panopto pipeline — bulk transcript download + enrichment", func(b bool) { st.WorkflowPanopto = b })
	panoptoCheck.SetChecked(st.WorkflowPanopto)

	ciCheck := widget.NewCheck("Curriculum Intelligence — semester comparison + course analysis", func(b bool) { st.WorkflowCI = b })
	ciCheck.SetChecked(st.WorkflowCI)

	registryCheck := widget.NewCheck("Registry — multi-course tracking", func(b bool) { st.WorkflowRegistry = b })
	registryCheck.SetChecked(st.WorkflowRegistry)

	pythonCheck := widget.NewCheck("Install Python 3 (needed later for Canvas Backup — not configured here)", func(b bool) { st.OptInPython = b })
	pythonCheck.SetChecked(st.OptInPython)

	form := container.NewVBox(
		title,
		hint,
		widget.NewSeparator(),
		canvasCheck,
		panoptoCheck,
		ciCheck,
		registryCheck,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Optional extras", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		pythonCheck,
	)

	back := widget.NewButton("Back", onBack)
	next := widget.NewButton("Next", onNext)
	next.Importance = widget.HighImportance
	bottom := container.NewBorder(nil, nil, container.NewHBox(back, widget.NewButton("Cancel", parent.Close)), next)
	return container.NewBorder(form, bottom, nil, nil)
}
