package main

type ProcessState string

const (
	Start   ProcessState = "start"
	Restart ProcessState = "restart"
	Stop    ProcessState = "stop"
)

type Process struct {
	state ProcessState
	name  ProcessName
}

type ProcessName string

const (
	server  ProcessName = "server"
	desktop ProcessName = "desktop"
)
