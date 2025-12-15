package docker_manager

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker_manager/v1"
	"github.com/RA341/dockman/internal/ssh"
	"gorm.io/gorm"
)

type Handler struct {
	srv *Service
}

func NewConnectHandler(srv *Service) *Handler {
	return &Handler{srv: srv}
}

func (h *Handler) NewClient(_ context.Context, req *connect.Request[v1.Machine]) (*connect.Response[v1.Empty], error) {
	ccm := FromProto(req.Msg)

	err := h.srv.AddClient(&ccm)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) StartUpdate(context.Context, *connect.Request[v1.Empty]) (*connect.Response[v1.Empty], error) {
	// todo
	//h.srv.UpdateContainers()
	return connect.NewResponse(&v1.Empty{}), nil
}

func (h *Handler) ListClients(_ context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.ListClientsResponse], error) {
	clients := h.srv.manager.ListHostNames()

	var protoClients []string
	for _, name := range clients {
		protoClients = append(protoClients, name)
	}

	return connect.NewResponse(&v1.ListClientsResponse{
		Clients: protoClients,
	}), nil
}

func (h *Handler) ListHosts(context.Context, *connect.Request[v1.Empty]) (*connect.Response[v1.ListMachine], error) {
	clients, err := h.srv.ssh.ListConfig()
	if err != nil {
		return nil, fmt.Errorf("unable to list clients: %w", err)
	}

	var protoClients []*v1.Machine
	for _, mach := range clients {
		protoClients = append(protoClients, ToProto(mach))
	}

	return connect.NewResponse(&v1.ListMachine{
		Machines: protoClients,
	}), nil
}

func (h *Handler) Get(_ context.Context, req *connect.Request[v1.GetMachine]) (*connect.Response[v1.Machine], error) {
	mach, err := h.srv.ssh.GetMach(req.Msg.Name)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(ToProto(mach)), nil
}

func (h *Handler) EditClient(_ context.Context, req *connect.Request[v1.Machine]) (*connect.Response[v1.Empty], error) {
	mach := FromProto(req.Msg)

	err := h.srv.EditClient(&mach)
	if err != nil {
		return nil, fmt.Errorf("unable to edit client: %w", err)
	}

	return connect.NewResponse(&v1.Empty{}), nil
}

func (h *Handler) ToggleClient(_ context.Context, req *connect.Request[v1.ToggleReqeust]) (*connect.Response[v1.Empty], error) {
	err := h.srv.ToggleClient(req.Msg.Name, req.Msg.Enable)
	if err != nil {
		return nil, fmt.Errorf("unable to enable client: %w", err)
	}

	return connect.NewResponse(&v1.Empty{}), nil
}

func (h *Handler) DeleteClient(_ context.Context, req *connect.Request[v1.Machine]) (*connect.Response[v1.Empty], error) {
	ccm := FromProto(req.Msg)

	if err := h.srv.DeleteClient(&ccm); err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.Empty{}), nil
}

func FromProto(machine *v1.Machine) ssh.MachineOptions {
	return ssh.MachineOptions{
		Model:            gorm.Model{ID: uint(machine.Id)},
		Name:             machine.Name,
		Enable:           machine.Enable,
		Host:             machine.Host,
		Port:             int(machine.Port),
		User:             machine.User,
		Password:         machine.Password,
		UsePublicKeyAuth: machine.UsePublicKeyAuth,
	}
}

func ToProto(options ssh.MachineOptions) *v1.Machine {
	return &v1.Machine{
		Id:               uint64(options.ID),
		Name:             options.Name,
		Enable:           options.Enable,
		Host:             options.Host,
		Port:             int32(options.Port),
		User:             options.User,
		Password:         options.Password,
		UsePublicKeyAuth: options.UsePublicKeyAuth,
	}
}
