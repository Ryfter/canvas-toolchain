package tasks

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func ExtractTarGz(ctx context.Context, data []byte, dest string) (int, error) {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return 0, fmt.Errorf("mkdir %s: %w", dest, err)
	}
	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	count := 0
	for {
		select {
		case <-ctx.Done():
			return count, ctx.Err()
		default:
		}

		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, fmt.Errorf("tar next: %w", err)
		}

		cleanName := filepath.Clean(hdr.Name)
		if filepath.IsAbs(cleanName) || hasParentTraversal(cleanName) {
			return count, fmt.Errorf("refusing tar entry with unsafe path: %s", hdr.Name)
		}
		target := filepath.Join(dest, cleanName)

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)|0o700); err != nil {
				return count, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return count, err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode)|0o600)
			if err != nil {
				return count, err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return count, err
			}
			f.Close()
			count++
		}
	}
	return count, nil
}

func hasParentTraversal(p string) bool {
	return containsDotDot(p)
}

func containsDotDot(p string) bool {
	for _, segment := range splitAll(p) {
		if segment == ".." {
			return true
		}
	}
	return false
}

func splitAll(p string) []string {
	var out []string
	for {
		dir, file := filepath.Split(p)
		if file != "" {
			out = append([]string{file}, out...)
		}
		if dir == "" || dir == string(filepath.Separator) || dir == p {
			break
		}
		p = filepath.Clean(dir)
	}
	return out
}
