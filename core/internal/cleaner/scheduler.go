package cleaner

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"
)

type Task func(ctx context.Context)

type Scheduler struct {
	task    Task
	taskCtx context.Context

	interval time.Duration
	// used to send cancel task loop
	cancelChan chan struct{}
	// used to initiate task
	manualChan  chan struct{}
	ctxCancelFn context.CancelFunc
}

// NewScheduler task is expected to be a long-running function that will run in a go routine
func NewScheduler(task Task, interval time.Duration) *Scheduler {
	s := &Scheduler{
		task: task,
		// context will be handled by Scheduler.start
		//taskCtx:     ctx,
		//ctxCancelFn: cancel,

		interval:   interval,
		cancelChan: make(chan struct{}, 1),
		manualChan: make(chan struct{}, 1),
	}
	s.start()
	return s
}

// Manual Trigger the task manually
//
// will skip the timer if occurs during task execution
// returns status
func (s *Scheduler) Manual() string {
	select {
	case s.manualChan <- struct{}{}:
		return "task triggered manually"
	default:
		return "task is already running"
	}
}

// Restart the loop read in new interval if modified
func (s *Scheduler) Restart() {
	s.Stop()
	s.start()
}

// Stop the loop exiting the go routine as immediately
//
// if a task is running it will wait until it is done executing
func (s *Scheduler) Stop() {
	select {
	case s.cancelChan <- struct{}{}:
		s.ctxCancelFn()
	default:
		log.Debug().Msg("Cancel channel is already cancelled")
	}
}

// Start the task loop
func (s *Scheduler) start() {
	ctx, cancel := context.WithCancel(context.Background())
	s.taskCtx = ctx
	s.ctxCancelFn = cancel

	go s.loop()
}

func (s *Scheduler) loop() {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case _ = <-ticker.C:
			s.Manual()
		case <-s.manualChan:
			log.Debug().Msg("task starting")
			s.task(s.taskCtx)
			log.Debug().Msg("task complete")
		case <-s.cancelChan:
			return
		}
	}
}
