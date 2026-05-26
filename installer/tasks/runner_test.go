package tasks

import (
	"context"
	"errors"
	"testing"
)

func TestRunner_RunsStepsInOrder(t *testing.T) {
	var order []string
	r := &Runner{
		Steps: []Step{
			{Name: "a", Run: func(ctx context.Context) error { order = append(order, "a"); return nil }},
			{Name: "b", Run: func(ctx context.Context) error { order = append(order, "b"); return nil }},
		},
	}
	r.Run(context.Background())
	if len(order) != 2 || order[0] != "a" || order[1] != "b" {
		t.Errorf("expected order [a b], got %v", order)
	}
}

func TestRunner_StopsOnError(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "ok", Run: func(ctx context.Context) error { ran = append(ran, "ok"); return nil }},
			{Name: "bad", Run: func(ctx context.Context) error { ran = append(ran, "bad"); return errors.New("boom") }},
			{Name: "never", Run: func(ctx context.Context) error { ran = append(ran, "never"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 2 {
		t.Errorf("expected 2 steps to run, got %d", len(ran))
	}
	if results[1].Status != StepError {
		t.Errorf("expected step 1 to be StepError, got %v", results[1].Status)
	}
}

func TestRunner_WarnStepContinues(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "warn", Warn: true, Run: func(ctx context.Context) error { ran = append(ran, "warn"); return errors.New("boom") }},
			{Name: "after", Run: func(ctx context.Context) error { ran = append(ran, "after"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 2 {
		t.Errorf("expected both steps to run, got %v", ran)
	}
	if results[0].Status != StepWarn {
		t.Errorf("expected warn status, got %v", results[0].Status)
	}
}

func TestRunner_SkipsWhenSkipReturnsTrue(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "skipped", Skip: func() bool { return true }, Run: func(ctx context.Context) error { ran = append(ran, "no"); return nil }},
			{Name: "after", Run: func(ctx context.Context) error { ran = append(ran, "yes"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 1 || ran[0] != "yes" {
		t.Errorf("expected only 'yes' to run, got %v", ran)
	}
	if results[0].Status != StepOK {
		t.Errorf("expected skipped step to report StepOK, got %v", results[0].Status)
	}
}
