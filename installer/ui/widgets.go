package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type MaskedEntry struct {
	widget.Entry
}

func NewMaskedEntry(placeholder string) *MaskedEntry {
	e := &MaskedEntry{}
	e.ExtendBaseWidget(e)
	e.Password = true
	e.SetPlaceHolder(placeholder)
	return e
}

type StatusRow struct {
	widget.BaseWidget
	icon  *canvas.Text
	label *widget.Label
	hint  *widget.Label
}

type RowStatus int

const (
	StatusPending RowStatus = iota
	StatusRunning
	StatusOK
	StatusWarn
	StatusError
)

func NewStatusRow(label string) *StatusRow {
	r := &StatusRow{
		icon:  canvas.NewText("…", ColorTextPrimary),
		label: widget.NewLabel(label),
		hint:  widget.NewLabel(""),
	}
	r.ExtendBaseWidget(r)
	return r
}

func (r *StatusRow) SetStatus(s RowStatus, hint string) {
	switch s {
	case StatusPending:
		r.icon.Text = "…"
		r.icon.Color = ColorTextPrimary
	case StatusRunning:
		r.icon.Text = "▶"
		r.icon.Color = ColorPrimary
	case StatusOK:
		r.icon.Text = "✓"
		r.icon.Color = ColorSuccess
	case StatusWarn:
		r.icon.Text = "⚠"
		r.icon.Color = ColorWarning
	case StatusError:
		r.icon.Text = "✗"
		r.icon.Color = ColorDanger
	}
	r.hint.SetText(hint)
	canvas.Refresh(r.icon)
}

func (r *StatusRow) CreateRenderer() fyne.WidgetRenderer {
	box := container.NewHBox(r.icon, r.label, r.hint)
	return widget.NewSimpleRenderer(box)
}

type HintedField struct {
	Label string
	Input fyne.CanvasObject
	Hint  string
}

func (h HintedField) AsCanvasObject() fyne.CanvasObject {
	hintLabel := canvas.NewText(h.Hint, color.NRGBA{R: 0x55, G: 0x55, B: 0x50, A: 0xFF})
	hintLabel.TextSize = 11
	return container.NewVBox(
		widget.NewLabelWithStyle(h.Label, fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		h.Input,
		hintLabel,
	)
}
