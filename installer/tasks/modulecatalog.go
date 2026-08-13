// installer/tasks/modulecatalog.go
package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// maxCatalogBytes caps the module catalog response we'll decode. Catalogs
// are tiny (a handful of module entries); anything past this is refused
// rather than decoded.
const maxCatalogBytes = 1 << 20 // 1 MiB

// ModuleCatalogURL is the raw-GitHub location of the module catalog on main.
const ModuleCatalogURL = "https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/module-catalog.json"

// supportedCatalogVersion is the newest catalog schema this installer understands.
// v2 added companions[] alongside modules[]; older catalogs (v1) remain readable.
// Versions newer than this are refused so a future schema cannot silently
// drop fields the picker depends on.
const supportedCatalogVersion = 2

// CatalogModule is one entry of module-catalog.json (installer-relevant fields only).
type CatalogModule struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	Bundled     bool   `json:"bundled"`
}

type moduleCatalog struct {
	CatalogVersion int             `json:"catalogVersion"`
	Modules        []CatalogModule `json:"modules"`
}

// FetchModuleCatalog downloads and parses the catalog, returning only
// non-bundled (channel-installable) modules. The installer NEVER downloads
// module code — this list only feeds the request picker.
func FetchModuleCatalog(ctx context.Context, url string) ([]CatalogModule, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("module catalog fetch: HTTP %d", res.StatusCode)
	}
	var cat moduleCatalog
	if err := json.NewDecoder(io.LimitReader(res.Body, maxCatalogBytes)).Decode(&cat); err != nil {
		return nil, fmt.Errorf("module catalog parse: %w", err)
	}
	if cat.CatalogVersion < 1 || cat.CatalogVersion > supportedCatalogVersion {
		return nil, fmt.Errorf("module catalog version %d unsupported (want 1..%d)", cat.CatalogVersion, supportedCatalogVersion)
	}
	out := make([]CatalogModule, 0, len(cat.Modules))
	for _, m := range cat.Modules {
		if !m.Bundled {
			out = append(out, m)
		}
	}
	return out, nil
}

// WritePendingModuleRequests writes the ids the user picked to
// <ccHome>/pending-module-installs.json (0600). It is a REQUEST for the chat
// flow to fulfil — never an authorization; no code is downloaded here.
// Empty ids → no file, empty path, nil error.
func WritePendingModuleRequests(ccHome string, ids []string) (string, error) {
	if len(ids) == 0 {
		return "", nil
	}
	if err := os.MkdirAll(ccHome, 0o755); err != nil {
		return "", err
	}
	payload := struct {
		RequestedAt string   `json:"requestedAt"`
		Modules     []string `json:"modules"`
	}{RequestedAt: time.Now().UTC().Format(time.RFC3339), Modules: ids}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	path := filepath.Join(ccHome, "pending-module-installs.json")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return "", err
	}
	return path, nil
}
