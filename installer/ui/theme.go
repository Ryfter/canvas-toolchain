package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

var (
	ColorPrimary      = color.NRGBA{R: 0x00, G: 0x33, B: 0xA0, A: 0xFF}
	ColorPrimaryDark  = color.NRGBA{R: 0x00, G: 0x22, B: 0x77, A: 0xFF}
	ColorPrimaryLight = color.NRGBA{R: 0xE6, G: 0xEC, B: 0xF9, A: 0xFF}
	ColorNeutral      = color.NRGBA{R: 0xF4, G: 0xF3, B: 0xEF, A: 0xFF}
	ColorTextPrimary  = color.NRGBA{R: 0x1A, G: 0x1A, B: 0x1A, A: 0xFF}
	ColorSuccess      = color.NRGBA{R: 0x3B, G: 0x6D, B: 0x11, A: 0xFF}
	ColorWarning      = color.NRGBA{R: 0x85, G: 0x4F, B: 0x0B, A: 0xFF}
	ColorDanger       = color.NRGBA{R: 0xA3, G: 0x2D, B: 0x2D, A: 0xFF}
)

var (
	ColorButtonBG     = color.NRGBA{R: 0xE5, G: 0xE3, B: 0xDD, A: 0xFF}
	ColorInputBG      = color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0xFF}
	ColorPlaceholder  = color.NRGBA{R: 0x77, G: 0x77, B: 0x72, A: 0xFF}
	ColorDisabled     = color.NRGBA{R: 0xAA, G: 0xAA, B: 0xA5, A: 0xFF}
	ColorDisabledBG   = color.NRGBA{R: 0xEC, G: 0xEA, B: 0xE4, A: 0xFF}
	ColorHover        = color.NRGBA{R: 0xD8, G: 0xD6, B: 0xCE, A: 0xFF}
	ColorSeparator    = color.NRGBA{R: 0xC8, G: 0xC6, B: 0xC0, A: 0xFF}
	ColorShadow       = color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x33}
)

type InstallerTheme struct{}

func (InstallerTheme) Color(n fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch n {
	case theme.ColorNamePrimary:
		return ColorPrimary
	case theme.ColorNameBackground:
		return ColorNeutral
	case theme.ColorNameForeground:
		return ColorTextPrimary
	case theme.ColorNameSuccess:
		return ColorSuccess
	case theme.ColorNameWarning:
		return ColorWarning
	case theme.ColorNameError:
		return ColorDanger
	case theme.ColorNameButton:
		return ColorButtonBG
	case theme.ColorNameDisabledButton:
		return ColorDisabledBG
	case theme.ColorNameDisabled:
		return ColorDisabled
	case theme.ColorNameInputBackground:
		return ColorInputBG
	case theme.ColorNameInputBorder:
		return ColorSeparator
	case theme.ColorNamePlaceHolder:
		return ColorPlaceholder
	case theme.ColorNameHover:
		return ColorHover
	case theme.ColorNameFocus:
		return ColorPrimary
	case theme.ColorNameSelection:
		return ColorPrimaryLight
	case theme.ColorNameSeparator:
		return ColorSeparator
	case theme.ColorNameShadow:
		return ColorShadow
	case theme.ColorNameMenuBackground:
		return ColorNeutral
	case theme.ColorNameOverlayBackground:
		return ColorNeutral
	}
	return theme.DefaultTheme().Color(n, theme.VariantLight)
}

func (InstallerTheme) Font(s fyne.TextStyle) fyne.Resource { return theme.DefaultTheme().Font(s) }
func (InstallerTheme) Icon(n fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(n)
}
func (InstallerTheme) Size(n fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(n)
}
