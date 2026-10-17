package screens

import (
	"encoding/json"
	"fmt"
	"runtime"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/tasks"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewSummaryScreen(parent fyne.Window, st *State, onClose func()) fyne.CanvasObject {
	titleText := fmt.Sprintf("Canvas Toolchain %s installed", st.Version)
	if st.MarkerWithheld {
		titleText = fmt.Sprintf("Canvas Toolchain %s installed — setup needs attention", st.Version)
	}
	title := widget.NewLabelWithStyle(titleText, fyne.TextAlignCenter, fyne.TextStyle{Bold: true})

	wins := container.NewVBox(
		ui.NewStatusRowWithStatus("Source installed to "+st.InstallDir, ui.StatusOK, ""),
	)
	for _, h := range tasks.SupportedHosts() {
		if st.WiredHosts[h.ID] {
			wins.Add(ui.NewStatusRowWithStatus("Wired to "+h.DisplayName, ui.StatusOK, ""))
		}
	}
	if st.InstalledPython {
		wins.Add(ui.NewStatusRowWithStatus("Python 3 installed", ui.StatusOK, ""))
	}
	wins.Add(ui.NewStatusRowWithStatus("Updater shortcut on Desktop / Applications", ui.StatusOK, ""))

	setup := setupSection(st)

	nextStep := widget.NewLabelWithStyle(
		`Next step: open your AI app and say "get started".`, fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	nextStepHint := widget.NewLabel("Your assistant runs the setup check (ct_setup action get_started) and walks you through whatever is left — nothing to type in a terminal.")
	nextStepHint.Wrapping = fyne.TextWrapWord

	snippet := widget.NewMultiLineEntry()
	snippet.SetText(buildSnippet(st))
	snippet.Wrapping = fyne.TextWrapOff
	snippet.SetMinRowsVisible(6)
	snippetExpander := widget.NewAccordion(
		widget.NewAccordionItem("Other MCP hosts — copy this config",
			container.NewVBox(
				widget.NewLabel("Paste into your client's MCP server config (Cursor, Windsurf, ChatGPT Desktop, Gemini, etc.):"),
				snippet,
			),
		),
	)

	var launchBtn fyne.CanvasObject = layout.NewSpacer()
	if st.WiredHosts["claude-desktop"] {
		launchBtn = ui.NewHoverButton("Launch Claude Desktop", ui.ButtonPrimary, func() {
			_ = launchClaudeDesktop()
			onClose()
		})
	}
	done := ui.NewHoverButton("Done", ui.ButtonDefault, onClose)

	body := container.NewVBox(
		title,
		widget.NewSeparator(),
		wins,
		widget.NewSeparator(),
		setup,
		widget.NewSeparator(),
		nextStep,
		nextStepHint,
		widget.NewSeparator(),
		snippetExpander,
	)

	bottom := container.NewBorder(nil, nil, done, launchBtn)
	return container.NewBorder(nil, bottom, nil, nil, container.NewVScroll(body))
}

// setupSection renders the doctor's verdict on this machine. Every readiness
// line and every fix comes from the setup engine, so the installer neither
// under-reports nor over-claims. When the doctor could not run, the installer's
// own step results stand in, so the screen still says something true.
func setupSection(st *State) fyne.CanvasObject {
	if st.Doctor == nil {
		return fallbackSetupSection(st)
	}

	box := container.NewVBox(
		widget.NewLabelWithStyle("Setup readiness", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
	)
	ready := st.Doctor.ReadyJourneys
	box.Add(capabilityRow("Local authoring — write Canvas-safe pages and preview them", ready.LocalAuthoring))
	box.Add(capabilityRow("Canvas connected — publish straight to Canvas", ready.CanvasConnected))
	box.Add(capabilityRow("AI assisted — Anthropic or a local model", ready.AiAssisted))

	findings := 0
	for _, check := range st.Doctor.Checks {
		if check.Status == "ok" {
			continue
		}
		findings++
		box.Add(checkRow(check))
	}
	if findings == 0 {
		box.Add(ui.NewStatusRowWithStatus("Nothing to fix — every check passed.", ui.StatusOK, ""))
	}
	addPanoptoNote(box, st)
	if st.MarkerWithheld {
		box.Add(ui.NewStatusRowWithStatus(
			"Install version not recorded — "+st.MarkerReason+", so the Updater cannot compare this install to new releases. Re-run the installer once the items above are fixed.",
			ui.StatusWarn, "",
		))
	}
	return box
}

// fallbackSetupSection is the summary the installer showed before it asked the
// doctor: a short note that the check could not run. The installer collects no
// credentials any more, so it cannot vouch for any of them — the honest
// fallback is to say the install is unverified and point at the chat.
func fallbackSetupSection(st *State) fyne.CanvasObject {
	box := container.NewVBox(
		ui.NewStatusRowWithStatus("Setup check unavailable — "+doctorUnavailableReason(st), ui.StatusWarn, ""),
	)
	note := widget.NewLabel("This install is not verified yet. Open your AI app and say \"get started\" — it checks what is left.")
	note.Wrapping = fyne.TextWrapWord
	box.Add(note)
	addPanoptoNote(box, st)
	return box
}

// addPanoptoNote is the installer's own question, not the doctor's: the doctor
// inspects no Panopto config, and the professor chose this workflow on the
// workflows screen. Panopto is opt-in, so the note only applies when the
// workflow was chosen — and because the installer no longer collects Panopto
// credentials, a chosen workflow is always incomplete here, so the note is a
// pointer to where the credentials are added. It shows on both summary paths.
func addPanoptoNote(box *fyne.Container, st *State) {
	if !st.WorkflowPanopto {
		return
	}
	note := widget.NewLabel("Panopto workflow selected — your AI app finishes Panopto setup (setup_panopto).")
	note.Wrapping = fyne.TextWrapWord
	box.Add(note)
}

func doctorUnavailableReason(st *State) string {
	if st.DoctorErr != nil {
		return st.DoctorErr.Error()
	}
	return "it did not run"
}

// capabilityRow is one of the doctor's three readiness verdicts. "Not set up
// yet" is a warn, not an error: a professor who only writes pages needs no
// Canvas token.
func capabilityRow(label string, ready bool) *ui.StatusRow {
	if ready {
		return ui.NewStatusRowWithStatus(label, ui.StatusOK, "")
	}
	return ui.NewStatusRowWithStatus(label, ui.StatusWarn, "not set up yet")
}

// checkRow is one non-ok doctor check plus the operation that fixes it.
func checkRow(check tasks.DoctorCheck) fyne.CanvasObject {
	status := ui.StatusWarn
	if check.Status == "fail" {
		status = ui.StatusError
	}
	row := ui.NewStatusRowWithStatus(check.Summary, status, "")
	if check.Fix == nil {
		return row
	}
	fix := widget.NewLabel("Fix: " + check.FixHint())
	fix.Wrapping = fyne.TextWrapWord
	return container.NewVBox(row, fix)
}

func buildSnippet(st *State) string {
	return buildSnippetForGOOS(st, runtime.GOOS)
}

// buildSnippetForGOOS is the copy-paste config for MCP hosts the installer does
// not auto-wire. The command is the bundled Node the install tasks use, so the
// path is right on every platform — Windows keeps node.exe directly under
// <InstallDir>/.node, not .node/bin. Marshal rather than template: a Windows
// path holds backslashes, which must be JSON-escaped to stay copy-pasteable.
func buildSnippetForGOOS(st *State, goos string) string {
	config := map[string]any{
		"mcpServers": map[string]any{
			"canvas-toolchain": mcpSnippetEntry{
				Command: tasks.NodeBinaryPath(st.InstallDir, goos),
				Args:    []string{st.InstallDir + "/packages/command-and-control/dist/index.js"},
			},
		},
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return ""
	}
	return string(data)
}

type mcpSnippetEntry struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

var launchClaudeDesktop = func() error { return nil }
