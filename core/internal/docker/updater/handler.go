package updater

// todo
//func (srv *Service) ResetContainerUpdater() {
//	srv.StopContainerUpdater()
//	go srv.StartContainerUpdater()
//}
//
//func (srv *Service) StopContainerUpdater() {
//	close(srv.updaterCtx)
//}
//
//// StartContainerUpdater blocking function
//// should be always called in a go routine
//func (srv *Service) StartContainerUpdater() {
//	srv.updaterCtx = make(chan interface{})
//
//	userConfig, err := srv.userConfig.GetConfig()
//	if err != nil {
//		log.Warn().Err(err).Msg("unable to get config, container updater will not be run")
//		return
//	}
//
//	if !userConfig.ContainerUpdater.Enable {
//		log.Info().Any("config", userConfig.ContainerUpdater).
//			Msg("Container updater is disabled in config, enable to run updater service")
//		return
//	}
//
//	updateInterval := userConfig.ContainerUpdater.Interval
//	log.Info().Str("interval", updateInterval.String()).
//		Msg("Starting dockman container update service")
//	tick := time.NewTicker(updateInterval)
//	defer tick.Stop()
//
//	var opts []updater.UpdateOption
//	if userConfig.ContainerUpdater.NotifyOnly {
//		log.Info().Msg("notify only mode enabled, only image update notifications will be sent")
//		opts = append(opts, updater.WithNotifyOnly())
//	}
//
//	for {
//		select {
//		case _, ok := <-srv.updaterCtx:
//			if !ok {
//				log.Debug().Msg("container updater service stopped")
//				return
//			}
//		case <-tick.C:
//			srv.UpdateContainers(opts...)
//		}
//	}
//}
//
//// todo move to docker/updater
//
//func (srv *Service) UpdateContainers(opts ...updater.UpdateOption) {
//	updateHost := func(name string, dock *ConnectedDockerClient) error {
//		cli := srv.loadDockerService(name, dock)
//		err := cli.Updater.ContainersUpdateAll(context.Background(), opts...)
//		if err != nil {
//			return fmt.Errorf("error occured while updating containers for host: %s\n%w", name, err)
//		}
//
//		log.Info().Str("host", name).Msg("updated containers for host")
//		return nil
//	}
//
//	var wg sync.WaitGroup
//	var mu sync.Mutex
//	var errors []error
//
//	for name, dock := range srv.manager.ListHosts() {
//		wg.Go(func() {
//			if err := updateHost(name, dock); err != nil {
//				mu.Lock()
//				errors = append(errors, err)
//				mu.Unlock()
//			}
//		})
//	}
//	wg.Wait()
//
//	for _, err := range errors {
//		// todo send notif
//		log.Error().Err(err).Msg("host update failed")
//	}
//}
//
