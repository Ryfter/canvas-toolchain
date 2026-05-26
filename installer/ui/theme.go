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

type InstallerTheme struct{}

func (InstallerTheme) Color(n fyne.ThemeColorName, v fyne.ThemeVariant) color.Color {
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
	}
	return theme.DefaultTheme().Color(n, v)
}

func (InstallerTheme) Font(s fyne.TextStyle) fyne.Resource { return theme.DefaultTheme().Font(s) }
func (InstallerTheme) Icon(n fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(n)
}
func (InstallerTheme) Size(n fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(n)
}
