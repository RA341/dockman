package host

import (
	"context"
	"strings"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/host/v1"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/listutils"
	"gorm.io/gorm"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) *Handler {
	return &Handler{
		srv: srv,
	}
}

func (h *Handler) ToggleClient(ctx context.Context, req *connect.Request[v1.ToggleRequest]) (*connect.Response[v1.ToggleResponse], error) {
	name := req.Msg.Name
	tog := req.Msg.Enable

	err := h.srv.Toggle(name, tog)
	if err != nil {
		return nil, err
	}
	return &connect.Response[v1.ToggleResponse]{}, nil
}

func (h *Handler) ListAllHosts(context.Context, *connect.Request[v1.ListClientRequest]) (*connect.Response[v1.ListClientsResponse], error) {
	all, err := h.srv.ListAll()
	if err != nil {
		return nil, err
	}

	rpcList := listutils.ToMap(all, func(conf Config) *v1.Host {
		return conf.ToProto()
	})

	return connect.NewResponse(&v1.ListClientsResponse{
		Hosts: rpcList,
	}), nil
}

func (h *Handler) ListConnectedHosts(context.Context, *connect.Request[v1.ListConnectedHostRequest]) (*connect.Response[v1.ListConnectedHostResponse], error) {
	hosts := h.srv.activeClients.Keys()

	return connect.NewResponse(&v1.ListConnectedHostResponse{
		Hosts: hosts,
	}), nil
}

func (h *Handler) CreateHost(_ context.Context, req *connect.Request[v1.CreateHostRequest]) (*connect.Response[v1.CreateHostResponse], error) {
	conf := ConfigFromProto(req.Msg.Host)
	err := h.srv.Add(conf, true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.CreateHostResponse{}), nil
}

func (h *Handler) EditHost(_ context.Context, req *connect.Request[v1.EditHostRequest]) (*connect.Response[v1.EditHostResponse], error) {
	conf := ConfigFromProto(req.Msg.Host)
	err := h.srv.Edit(conf)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.EditHostResponse{}), nil
}

func (h *Handler) DeleteHost(_ context.Context, req *connect.Request[v1.DeleteHostRequest]) (*connect.Response[v1.DeleteHostResponse], error) {
	err := h.srv.Delete(req.Msg.Host)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.DeleteHostResponse{}), nil
}

func (h *Handler) DeleteAlias(ctx context.Context, c *connect.Request[v1.DeleteAliasRequest]) (*connect.Response[v1.DeleteAliasResponse], error) {
	hostId := c.Msg.HostId
	alias := c.Msg.Alias

	err := h.srv.aliasStore.RemoveAlias(uint(hostId), alias)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.DeleteAliasResponse{}), nil
}

func (h *Handler) ListAlias(_ context.Context, req *connect.Request[v1.ListAliasRequest]) (*connect.Response[v1.ListAliasResponse], error) {
	host := req.Msg.Host

	aliases, err := h.srv.ListAliases(host)
	if err != nil {
		return nil, err
	}

	rpcAlias := listutils.ToMap(aliases, func(al FolderAlias) *v1.FolderAlias {
		return FolderAliasToProto(al)
	})

	return connect.NewResponse(&v1.ListAliasResponse{
		Aliases: rpcAlias,
	}), nil
}

func (h *Handler) AddAlias(_ context.Context, req *connect.Request[v1.AddAliasRequest]) (*connect.Response[v1.AddAliasResponse], error) {
	alias := req.Msg.Alias.Alias
	fullpath := req.Msg.Alias.Fullpath
	hostId := req.Msg.HostId

	err := h.srv.aliasStore.AddAlias(uint(hostId), alias, fullpath)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.AddAliasResponse{}), nil
}

func (h *Handler) EditAlias(ctx context.Context, req *connect.Request[v1.EditAliasRequest]) (*connect.Response[v1.EditAliasResponse], error) {
	alias := req.Msg.Alias.Alias
	fullpath := req.Msg.Alias.Fullpath
	id := req.Msg.Alias.Id

	hostId := req.Msg.HostId

	err := h.srv.aliasStore.EditAlias(uint(hostId), uint(id), &FolderAlias{
		Alias:    alias,
		Fullpath: fullpath,
	})
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.EditAliasResponse{}), nil
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// serialization

func FolderAliasToProto(m FolderAlias) *v1.FolderAlias {
	return &v1.FolderAlias{
		Id:       uint32(m.ID),
		Alias:    m.Alias,
		Fullpath: m.Fullpath,
	}
}

func FolderAliasFromProto(p *v1.FolderAlias) FolderAlias {
	return FolderAlias{
		ConfigID: uint(p.Id),
		Alias:    p.Alias,
		Fullpath: p.Fullpath,
	}
}

// --- MachineOptions (SSHConfig) Mappings ---

func SSHConfigToProto(m *ssh.MachineOptions) *v1.SSHConfig {
	if m == nil {
		return nil
	}
	return &v1.SSHConfig{
		Id:               uint32(m.ID),
		Host:             m.Host,
		Port:             int32(m.Port),
		User:             m.User,
		Password:         m.Password,
		RemotePublicKey:  m.RemotePublicKey,
		UsePublicKeyAuth: m.UsePublicKeyAuth,
	}
}

func SSHConfigFromProto(p *v1.SSHConfig) *ssh.MachineOptions {
	if p == nil {
		return nil
	}
	return &ssh.MachineOptions{
		Model:            gorm.Model{ID: uint(p.Id)},
		Host:             p.Host,
		Port:             int(p.Port),
		User:             p.User,
		Password:         p.Password,
		RemotePublicKey:  p.RemotePublicKey,
		UsePublicKeyAuth: p.UsePublicKeyAuth,
	}
}

// --- Config (Host) Mappings ---

func (c *Config) ToProto() *v1.Host {
	p := &v1.Host{
		Id:           uint32(c.ID),
		Name:         c.Name,
		Enable:       c.Enable,
		DockerSocket: c.DockerSocket,
		// Map the Enum
		Kind: v1.ClientType(v1.ClientType_value[string(c.Type)]),
	}

	// Map Belongs To
	if c.SSHOptions != nil {
		p.SshOptions = SSHConfigToProto(c.SSHOptions)
	}

	// Map Has Many using your ToMap func
	p.FolderAliases = listutils.ToMap(c.FolderAliases, FolderAliasToProto)

	return p
}

func ConfigFromProto(p *v1.Host) *Config {
	c := &Config{
		Model:        gorm.Model{ID: uint(p.Id)},
		Name:         p.Name,
		Type:         ClientType(strings.ToLower(p.Kind.String())),
		Enable:       p.Enable,
		DockerSocket: p.DockerSocket,
	}

	if p.SshOptions != nil {
		c.SSHOptions = SSHConfigFromProto(p.SshOptions)
		c.SSHID = uint(p.SshOptions.Id)
	}

	c.FolderAliases = listutils.ToMap(p.FolderAliases, func(fa *v1.FolderAlias) FolderAlias {
		return FolderAliasFromProto(fa)
	})

	return c
}
