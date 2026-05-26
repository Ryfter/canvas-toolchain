package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/driver/desktop"
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

func NewStatusRowWithStatus(label string, s RowStatus, hint string) *StatusRow {
	r := NewStatusRow(label)
	r.SetStatus(s, hint)
	return r
}

type ButtonStyle int

const (
	ButtonDefault ButtonStyle = iota
	ButtonPrimary
)

type HoverButton struct {
	widget.BaseWidget
	text     string
	style    ButtonStyle
	onTapped func()
	hovered  bool
	disabled bool
}

func NewHoverButton(text string, style ButtonStyle, onTapped func()) *HoverButton {
	b := &HoverButton{text: text, style: style, onTapped: onTapped}
	b.ExtendBaseWidget(b)
	return b
}

func (b *HoverButton) Enable()  { b.disabled = false; b.Refresh() }
func (b *HoverButton) Disable() { b.disabled = true; b.Refresh() }

func (b *HoverButton) SetOnTapped(fn func()) { b.onTapped = fn }

func (b *HoverButton) Tapped(_ *fyne.PointEvent) {
	if b.disabled || b.onTapped == nil {
		return
	}
	b.onTapped()
}

func (b *HoverButton) MouseIn(_ *desktop.MouseEvent)     { b.hovered = true; b.Refresh() }
func (b *HoverButton) MouseOut()                         { b.hovered = false; b.Refresh() }
func (b *HoverButton) MouseMoved(_ *desktop.MouseEvent)  {}
func (b *HoverButton) Cursor() desktop.Cursor {
	if b.disabled {
		return desktop.DefaultCursor
	}
	return desktop.PointerCursor
}

func (b *HoverButton) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(color.Transparent)
	bg.CornerRadius = 4
	bg.StrokeWidth = 1
	label := canvas.NewText(b.text, ColorTextPrimary)
	label.Alignment = fyne.TextAlignCenter
	label.TextSize = 14
	r := &hoverButtonRenderer{b: b, bg: bg, label: label}
	r.applyColors()
	return r
}

type hoverButtonRenderer struct {
	b     *HoverButton
	bg    *canvas.Rectangle
	label *canvas.Text
}

func (r *hoverButtonRenderer) applyColors() {
	switch {
	case r.b.disabled:
		r.bg.FillColor = ColorDisabledBG
		r.bg.StrokeColor = ColorSeparator
		r.label.Color = ColorDisabled
	case r.b.style == ButtonPrimary && r.b.hovered:
		r.bg.FillColor = ColorPrimaryDark
		r.bg.StrokeColor = ColorPrimaryDark
		r.label.Color = color.White
	case r.b.style == ButtonPrimary:
		r.bg.FillColor = ColorPrimary
		r.bg.StrokeColor = ColorPrimary
		r.label.Color = color.White
	case r.b.hovered:
		r.bg.FillColor = ColorTextPrimary
		r.bg.StrokeColor = ColorTextPrimary
		r.label.Color = color.White
	default:
		r.bg.FillColor = ColorButtonBG
		r.bg.StrokeColor = ColorSeparator
		r.label.Color = ColorTextPrimary
	}
}

func (r *hoverButtonRenderer) Refresh() {
	r.label.Text = r.b.text
	r.applyColors()
	r.bg.Refresh()
	r.label.Refresh()
}

func (r *hoverButtonRenderer) Layout(s fyne.Size) {
	r.bg.Resize(s)
	ts := r.label.MinSize()
	r.label.Resize(fyne.NewSize(s.Width, ts.Height))
	r.label.Move(fyne.NewPos(0, (s.Height-ts.Height)/2))
}

func (r *hoverButtonRenderer) MinSize() fyne.Size {
	ts := r.label.MinSize()
	return fyne.NewSize(ts.Width+32, ts.Height+14)
}

func (r *hoverButtonRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.bg, r.label}
}

func (r *hoverButtonRenderer) Destroy() {}
