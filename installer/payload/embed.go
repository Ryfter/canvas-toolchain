package payload

import _ "embed"

//go:embed installer-payload.tar.gz
var PayloadTarGz []byte

//go:embed node-runtime.tar.gz
var NodeTarGz []byte
