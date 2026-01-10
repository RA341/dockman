package main

import (
	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/info"
)

func init() {
	app.InitMeta(info.FlavourDocker)
}

func main() {
	app.StartServer()
}
