package main

import (
	"flag"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/pkg/argos"
	"github.com/rs/zerolog/log"
)

const EnvPrefix = "DOCKMAN_UPDATER"

func LoadConfig() *UpdaterConfig {
	conf := &UpdaterConfig{}
	if err := argos.Scan(conf, EnvPrefix); err != nil {
		log.Fatal().Err(err).Msg("Unable to load config")
	}

	flag.Parse()
	argos.PrettyPrint(conf, EnvPrefix)

	return conf
}

type UpdaterConfig struct {
	Port int           `config:"flag=port,env=PORT,default=8869,usage=Port to run the server on"`
	Log  config.Logger `config:""`
}

func main() {
	//logger.DefaultConfig()
	//conf := LoadConfig()
	//logger.InitConsole(conf.Log.Level, conf.Log.Verbose)
	//
	//client, err := host.NewLocalClient()
	//if err != nil {
	//	log.Fatal().Err(err).Msg("Unable to connect to local docker client")
	//	return
	//}
	//srv := docker.NewUpdaterService(client)
	//
	//http.HandleFunc("/{contID}", func(w http.ResponseWriter, r *http.Request) {
	//	contID := r.PathValue("contID")
	//	log.Print("Handling request for contID:", contID)
	//
	//	err = srv.ContainersUpdateDockman(context.Background(), contID)
	//	if err != nil {
	//		log.Print(err)
	//		return
	//	}
	//})
	//
	//log.Info().Int("port", conf.Port).Msg("Dockman updater service started successfully")
	//err = http.ListenAndServe(fmt.Sprintf(":%d", conf.Port), nil)
	//if err != nil {
	//	log.Fatal().Err(err).Msg("Error starting server")
	//}
}
