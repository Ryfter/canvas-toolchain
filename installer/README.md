# Canvas Toolchain Installer

Self-contained native installer for canvas-toolchain. Written in Go using Fyne.

## Build

Requires Go 1.22+ and the platform's Fyne build prerequisites
([Fyne docs](https://docs.fyne.io/started/)).

Local dev build (without embedded payload):

    cd installer
    go build -o canvas-toolchain-installer .

A release build (with embedded payload and Node runtime) happens in CI —
see `.github/workflows/release-installer.yml` and Plan 3.

## Updater stub

    go build -tags updater_stub -o canvas-toolchain-updater ./update

## Tests

    go test ./...
