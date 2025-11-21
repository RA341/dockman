package main

import (
	"github.com/docker/docker/client"
)

var clu *client.Client

//func main() {
//	var err error
//	clu, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
//	if err != nil {
//		log.Fatal(fmt.Errorf("unable to create docker client: %w", err))
//	}
//
//}
