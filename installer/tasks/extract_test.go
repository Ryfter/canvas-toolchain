package tasks

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func makeTarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		hdr := &tar.Header{Name: name, Size: int64(len(content)), Mode: 0o644, Typeflag: tar.TypeReg}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestExtractTarGz_WritesFiles(t *testing.T) {
	data := makeTarGz(t, map[string]string{
		"hello.txt":     "hi",
		"sub/world.txt": "world",
	})
	dest := t.TempDir()
	n, err := ExtractTarGz(context.Background(), data, dest)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("expected 2 files, got %d", n)
	}
	hi, err := os.ReadFile(filepath.Join(dest, "hello.txt"))
	if err != nil || string(hi) != "hi" {
		t.Errorf("hello.txt content wrong: %q err %v", hi, err)
	}
	w, err := os.ReadFile(filepath.Join(dest, "sub", "world.txt"))
	if err != nil || string(w) != "world" {
		t.Errorf("sub/world.txt content wrong: %q err %v", w, err)
	}
}

func TestExtractTarGz_RejectsParentTraversal(t *testing.T) {
	data := makeTarGz(t, map[string]string{
		"../escape.txt": "nope",
	})
	dest := t.TempDir()
	_, err := ExtractTarGz(context.Background(), data, dest)
	if err == nil {
		t.Fatal("expected error for parent traversal")
	}
}

func TestExtractTarGz_RespectsContextCancel(t *testing.T) {
	data := makeTarGz(t, map[string]string{"a.txt": "x"})
	dest := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ExtractTarGz(ctx, data, dest)
	if err == nil {
		t.Fatal("expected context error")
	}
}
