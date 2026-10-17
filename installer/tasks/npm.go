package tasks

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
)

type NodePaths struct {
	Node string
	NPM  string
}

// NodeBinaryPath is the bundled Node executable for a target OS. The runtime
// unpacks differently per platform: Windows keeps node.exe directly under
// <installDir>/.node, every other platform under .node/bin. The OS is a
// parameter, and the separator is chosen from it, so the Windows layout is
// testable on any host. ResolveNodePaths and the summary's manual-config
// snippet both go through this one function, so the path a host is given can
// never drift from where the installer actually put Node.
func NodeBinaryPath(installDir, goos string) string {
	if goos == "windows" {
		return installDir + `\.node\node.exe`
	}
	return installDir + "/.node/bin/node"
}

func ResolveNodePaths(installDir string) NodePaths {
	nodeDir := filepath.Join(installDir, ".node")
	var npmCli string
	if runtime.GOOS == "windows" {
		npmCli = filepath.Join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")
	} else {
		npmCli = filepath.Join(nodeDir, "lib", "node_modules", "npm", "bin", "npm-cli.js")
	}
	return NodePaths{Node: NodeBinaryPath(installDir, runtime.GOOS), NPM: npmCli}
}

func RunNPM(ctx context.Context, np NodePaths, workdir string, args []string, out func(line string)) error {
	cmd := exec.CommandContext(ctx, np.Node, append([]string{np.NPM}, args...)...)
	cmd.Dir = workdir

	var tail bytes.Buffer
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return err
	}

	scanBuf := make([]byte, 4096)
	for {
		n, err := pipe.Read(scanBuf)
		if n > 0 {
			chunk := string(scanBuf[:n])
			out(chunk)
			if tail.Len() > 4096 {
				tail.Truncate(0)
			}
			tail.WriteString(chunk)
		}
		if err != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("npm %v exited %v\n--- tail ---\n%s", args, err, tail.String())
	}
	return nil
}
