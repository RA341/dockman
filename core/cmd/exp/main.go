package main

import (
	"embed"
	"log"

	"github.com/RA341/dockman/internal/app"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:dist
var assets embed.FS

func main() {
	go func() {
		app.StartServer()
	}()

	err := wails.Run(&options.App{
		Title:  "Basic Demo",
		Width:  1920,
		Height: 1080,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Debug: options.Debug{
			OpenInspectorOnStartup: true,
		},
		//OnShutdown: app.shutdown,
		Bind:                   []interface{}{},
		BindingsAllowedOrigins: "*localhost*",
	})
	if err != nil {
		log.Fatal(err)
	}
}

func main() {
	//c, err := moby.New(moby.FromEnv)

	//c, err := client.NewClientWithOpts(client.FromEnv)
	//if err != nil {
	//	log.Fatal(err)
	//}

	//_, err = docker.LoadComposeClient(c, os.Stdout)
	//if err != nil {
	//	log.Fatal(err)
	//	return
	//}
}
