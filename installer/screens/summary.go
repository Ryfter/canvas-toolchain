package screens

import (
	"fmt"
	"runtime"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewSummaryScreen(parent fyne.Window, st *State, onClose func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle(
		fmt.Sprintf("Canvas Toolchain %s installed", st.Version),
		fyne.TextAlignCenter,
		fyne.TextStyle{Bold: true},
	)

	wins := container.NewVBox(
		ui.NewStatusRowWithStatus("Source installed to "+st.InstallDir, ui.StatusOK, ""),
	)
	if st.InstalledClaudeDesktop {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Desktop", ui.StatusOK, ""))
	}
	if st.InstalledClaudeCode {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Code CLI", ui.StatusOK, ""))
	}
	if st.InstalledPython {
		wins.Add(ui.NewStatusRowWithStatus("Python 3 installed", ui.StatusOK, ""))
	}
	wins.Add(ui.NewStatusRowWithStatus("Updater shortcut on Desktop / Applications", ui.StatusOK, ""))

	warns := container.NewVBox()
	if st.AnthropicAPIKey == "" {
		warns.Add(ui.NewStatusRowWithStatus("Anthropic API key not set — run setup_anthropic from your MCP client", ui.StatusWarn, ""))
	}
	if st.CanvasToken == "" {
		warns.Add(ui.NewStatusRowWithStatus("Canvas API token not set — run setup_canvas (optional)", ui.StatusWarn, ""))
	}
	if !st.WorkflowPanopto || (st.PanoptoDomain == "" || st.PanoptoClientID == "" || st.PanoptoSecret == "") {
		warns.Add(ui.NewStatusRowWithStatus("Panopto not configured — run setup_panopto when you're ready", ui.StatusWarn, ""))
	}
	if st.ValidationAnthropic.Attempted && !st.ValidationAnthropic.OK {
		warns.Add(ui.NewStatusRowWithStatus("Anthropic validation failed: "+st.ValidationAnthropic.Message, ui.StatusWarn, ""))
	}
	if st.ValidationCanvas.Attempted && !st.ValidationCanvas.OK {
		warns.Add(ui.NewStatusRowWithStatus("Canvas validation failed: "+st.ValidationCanvas.Message, ui.StatusWarn, ""))
	}

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

	launch := widget.NewButton("Launch Claude Desktop", func() {
		_ = launchClaudeDesktop()
		onClose()
	})
	launch.Importance = widget.HighImportance
	done := widget.NewButton("Done", onClose)

	bottom := container.NewBorder(nil, nil, done, launch)
	return container.NewBorder(
		container.NewVBox(title, widget.NewSeparator(), wins, widget.NewSeparator(), warns, widget.NewSeparator(), snippetExpander),
		bottom, nil, nil,
	)
}

func buildSnippet(st *State) string {
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	return fmt.Sprintf(`{
  "mcpServers": {
    "canvas-toolchain": {
      "command": "%s/.node/bin/node%s",
      "args": ["%s/packages/command-and-control/dist/index.js"]
    }
  }
}`, st.InstallDir, suffix, st.InstallDir)
}

var launchClaudeDesktop = func() error { return nil }
