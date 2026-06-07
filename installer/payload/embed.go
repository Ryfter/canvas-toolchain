package payload

import _ "embed"

//go:embed installer-payload.tar.gz
var PayloadTarGz []byte

//go:embed node-runtime.tar.gz
var NodeTarGz []byte

// UpdaterBin is the canvas-toolchain-updater binary for the installer's target
// OS/arch, built and copied here by CI immediately before `go build`. Empty in
// local dev builds (the install step warns and skips the updater in that case).
//
//go:embed updater-bin
var UpdaterBin []byte
