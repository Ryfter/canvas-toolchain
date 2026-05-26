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

func ResolveNodePaths(installDir string) NodePaths {
	nodeDir := filepath.Join(installDir, ".node")
	var nodeBin, npmCli string
	if runtime.GOOS == "windows" {
		nodeBin = filepath.Join(nodeDir, "node.exe")
		npmCli = filepath.Join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")
	} else {
		nodeBin = filepath.Join(nodeDir, "bin", "node")
		npmCli = filepath.Join(nodeDir, "lib", "node_modules", "npm", "bin", "npm-cli.js")
	}
	return NodePaths{Node: nodeBin, NPM: npmCli}
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
