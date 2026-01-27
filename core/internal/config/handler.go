package config

import (
	"context"
	"net/http"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/config/v1"
	configrpc "github.com/RA341/dockman/generated/config/v1/v1connect"
)

type Handler struct {
	srv *Service
}

func NewConnectHandler(srv *Service) (string, http.Handler) {
	h := &Handler{
		srv: srv,
	}
	return configrpc.NewConfigServiceHandler(h)
}

func (h *Handler) GetUserConfig(context.Context, *connect.Request[v1.Empty]) (*connect.Response[v1.UserConfig], error) {
	config, err := h.srv.GetConfig()
	if err != nil {
		return nil, err
	}

	rpcConfig := ToProto(config)
	return connect.NewResponse(&rpcConfig), nil
}

func (h *Handler) SetUserConfig(_ context.Context, req *connect.Request[v1.SetUserRequest]) (*connect.Response[v1.Empty], error) {
	userconfig := FromProto(req.Msg.Config)

	err := h.srv.SaveConfig(&userconfig, req.Msg.UpdateUpdater)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.Empty{}), nil
}

func ToProto(config *UserConfig) v1.UserConfig {
	return v1.UserConfig{
		Updater: &v1.ContainerUpdater{
			Enable:            config.ContainerUpdater.Enable,
			NotifyOnly:        config.ContainerUpdater.NotifyOnly,
			IntervalInSeconds: int64(config.ContainerUpdater.Interval.Seconds()),
		},
	}
}

func FromProto(config *v1.UserConfig) UserConfig {
	return UserConfig{
		ContainerUpdater: ContainerUpdater{
			Enable:     config.Updater.Enable,
			NotifyOnly: config.Updater.NotifyOnly,
			Interval:   time.Duration(config.Updater.IntervalInSeconds) * time.Second,
		},
	}
}
