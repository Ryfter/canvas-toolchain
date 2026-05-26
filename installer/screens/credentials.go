package screens

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewCredentialsScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("API credentials (optional)", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	hint := widget.NewLabel("All fields are optional. Skip whatever you don't have — you can fill them in later by running setup_anthropic, setup_canvas, or setup_panopto from your MCP client.")
	hint.Wrapping = fyne.TextWrapWord

	anthropicEntry := ui.NewMaskedEntry("sk-ant-...")
	anthropicEntry.SetText(st.AnthropicAPIKey)
	anthropicEntry.OnChanged = func(s string) { st.AnthropicAPIKey = s }

	canvasHostEntry := widget.NewEntry()
	canvasHostEntry.SetPlaceHolder("<school>.instructure.com")
	canvasHostEntry.SetText(st.CanvasHost)
	canvasHostEntry.OnChanged = func(s string) { st.CanvasHost = s }

	canvasTokenEntry := ui.NewMaskedEntry("Paste token here")
	canvasTokenEntry.SetText(st.CanvasToken)
	canvasTokenEntry.OnChanged = func(s string) { st.CanvasToken = s }

	fields := []fyne.CanvasObject{
		ui.HintedField{
			Label: "Anthropic API key",
			Input: anthropicEntry,
			Hint:  "Powers all AI features. Get one at platform.anthropic.com/account/api-keys.",
		}.AsCanvasObject(),
		ui.HintedField{
			Label: "Canvas host",
			Input: canvasHostEntry,
			Hint:  "Your school's Canvas URL — usually <school>.instructure.com.",
		}.AsCanvasObject(),
		ui.HintedField{
			Label: "Canvas API token",
			Input: canvasTokenEntry,
			Hint:  "Optional. Needed only for direct page publishing. Canvas → Account → Settings → New Access Token.",
		}.AsCanvasObject(),
	}

	if st.WorkflowPanopto {
		panoptoDomain := widget.NewEntry()
		panoptoDomain.SetPlaceHolder("<school>.hosted.panopto.com")
		panoptoDomain.SetText(st.PanoptoDomain)
		panoptoDomain.OnChanged = func(s string) { st.PanoptoDomain = s }

		panoptoClient := widget.NewEntry()
		panoptoClient.SetText(st.PanoptoClientID)
		panoptoClient.OnChanged = func(s string) { st.PanoptoClientID = s }

		panoptoSecret := ui.NewMaskedEntry("Client secret")
		panoptoSecret.SetText(st.PanoptoSecret)
		panoptoSecret.OnChanged = func(s string) { st.PanoptoSecret = s }

		fields = append(fields,
			widget.NewSeparator(),
			widget.NewLabelWithStyle("Panopto (optional)", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
			ui.HintedField{Label: "Panopto domain", Input: panoptoDomain, Hint: "e.g. <school>.hosted.panopto.com"}.AsCanvasObject(),
			ui.HintedField{Label: "Client ID", Input: panoptoClient, Hint: "Panopto admin → API Clients."}.AsCanvasObject(),
			ui.HintedField{Label: "Client secret", Input: panoptoSecret, Hint: "Same place as the client ID."}.AsCanvasObject(),
		)
	}

	form := container.NewVBox(append([]fyne.CanvasObject{title, hint, widget.NewSeparator()}, fields...)...)
	scroll := container.NewVScroll(form)

	skip := ui.NewHoverButton("Skip — I'll add these later", ui.ButtonDefault, func() {
		st.AnthropicAPIKey = ""
		st.CanvasToken = ""
		st.PanoptoDomain = ""
		st.PanoptoClientID = ""
		st.PanoptoSecret = ""
		onNext()
	})
	back := ui.NewHoverButton("Back", ui.ButtonDefault, onBack)
	next := ui.NewHoverButton("Next", ui.ButtonPrimary, onNext)
	bottom := container.NewBorder(nil, nil,
		container.NewHBox(back, ui.NewHoverButton("Cancel", ui.ButtonDefault, parent.Close), skip),
		next,
	)
	return container.NewBorder(nil, bottom, nil, nil, scroll)
}
