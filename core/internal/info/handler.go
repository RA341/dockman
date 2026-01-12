package info

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/info/v1"
)

type ConnectHandler struct {
	srv *Service
}

func NewConnectHandler(srv *Service) *ConnectHandler {
	return &ConnectHandler{
		srv: srv,
	}
}

func (c *ConnectHandler) GetChangelog(_ context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.Changelog], error) {
	inf, changelog, releaseUrl, err := c.srv.VerifyVersion(Version)
	if err != nil {
		return nil, err
	}

	if changelog == "" {
		// user does not need to read the changelog,
		// send empty changelog
		return connect.NewResponse(&v1.Changelog{}), nil
	}

	return connect.NewResponse(&v1.Changelog{
		Changelog: changelog,
		Url:       releaseUrl,
		Version:   inf.CurrentVersion.Version,
	}), nil
}

func (c *ConnectHandler) ReadVersion(_ context.Context, req *connect.Request[v1.ReadVersionRequest]) (*connect.Response[v1.Empty], error) {
	if req.Msg.Version == "" {
		return nil, fmt.Errorf("version is required")
	}

	err := c.srv.MarkChangelogAsRead(req.Msg.Version)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.Empty{}), nil
}

func (c *ConnectHandler) GetAppInfo(_ context.Context, req *connect.Request[v1.Empty]) (*connect.Response[v1.AppInfo], error) {
	appInfo := &v1.AppInfo{
		Version:   Version,
		Flavour:   string(Flavour),
		Commit:    CommitInfo,
		BuildDate: Branch,
		Branch:    CommitInfo,
	}

	if IsKnown(Branch) && IsKnown(CommitInfo) {
		appInfo.Branch = fmt.Sprintf("%s/tree/%s", repo, Branch)
		appInfo.Commit = fmt.Sprintf("%s/commit/%s", repo, CommitInfo)
	}

	return connect.NewResponse(appInfo), nil
}
