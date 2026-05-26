package tasks

import (
	"context"
	"sync"
	"time"
)

type StepStatus int

const (
	StepPending StepStatus = iota
	StepRunning
	StepOK
	StepWarn
	StepError
)

type Step struct {
	Name string
	Run  func(ctx context.Context) error
	Skip func() bool
	Warn bool
}

type StepResult struct {
	Status   StepStatus
	Err      error
	Duration time.Duration
}

type Runner struct {
	Steps    []Step
	OnUpdate func(index int, name string, result StepResult)

	mu      sync.Mutex
	results []StepResult
}

func (r *Runner) Run(ctx context.Context) []StepResult {
	r.mu.Lock()
	r.results = make([]StepResult, len(r.Steps))
	r.mu.Unlock()

	for i, s := range r.Steps {
		if s.Skip != nil && s.Skip() {
			r.report(i, s.Name, StepResult{Status: StepOK})
			continue
		}
		r.report(i, s.Name, StepResult{Status: StepRunning})
		start := time.Now()
		err := s.Run(ctx)
		dur := time.Since(start)
		switch {
		case err == nil:
			r.report(i, s.Name, StepResult{Status: StepOK, Duration: dur})
		case s.Warn:
			r.report(i, s.Name, StepResult{Status: StepWarn, Err: err, Duration: dur})
		default:
			r.report(i, s.Name, StepResult{Status: StepError, Err: err, Duration: dur})
			return r.results
		}
	}
	return r.results
}

func (r *Runner) report(i int, name string, res StepResult) {
	r.mu.Lock()
	if i < len(r.results) {
		r.results[i] = res
	}
	r.mu.Unlock()
	if r.OnUpdate != nil {
		r.OnUpdate(i, name, res)
	}
}
