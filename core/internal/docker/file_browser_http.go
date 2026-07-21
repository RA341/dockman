package docker

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	hostMid "github.com/RA341/dockman/internal/host/middleware"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/container"
	imageTypes "github.com/moby/moby/api/types/image"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

const (
	fileHelperLabel = "dockman.file-browser.helper"
	volumeRoot      = "/volume"
)

type browserTarget struct {
	cli         *client.Client
	containerID string
	root        string
	helperPath  string
	unlink      bool
	cleanup     func()
}

type browserAction struct {
	Action    string `json:"action"`
	Path      string `json:"path"`
	NewPath   string `json:"newPath"`
	Mode      string `json:"mode"`
	Recursive bool   `json:"recursive"`
}

func (h *HandlerHttp) containerFilesList(w http.ResponseWriter, r *http.Request) {
	target, err := h.prepareBrowserTarget(r, false, true)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()

	requested, err := cleanBrowserPath(r.URL.Query().Get("path"))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	stdout, err := h.runFileHelper(r.Context(), target, "list", requested)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(stdout)
}

func (h *HandlerHttp) containerFilesAction(w http.ResponseWriter, r *http.Request) {
	var input browserAction
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeBrowserError(w, fmt.Errorf("invalid request: %w", err))
		return
	}
	requested, err := cleanBrowserPath(input.Path)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	args := []string{input.Action, requested}
	switch input.Action {
	case "create-file", "create-folder", "delete":
	case "rename":
		newPath, pathErr := cleanBrowserPath(input.NewPath)
		if pathErr != nil {
			writeBrowserError(w, pathErr)
			return
		}
		args = append(args, newPath)
	case "chmod":
		if _, modeErr := strconv.ParseUint(input.Mode, 8, 12); modeErr != nil || len(input.Mode) < 3 || len(input.Mode) > 4 {
			writeBrowserError(w, fmt.Errorf("invalid octal mode"))
			return
		}
		args = append(args, input.Mode, strconv.FormatBool(input.Recursive))
	default:
		writeBrowserError(w, fmt.Errorf("unsupported file action"))
		return
	}

	target, err := h.prepareBrowserTarget(r, true, true)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()
	if _, err = h.runFileHelper(r.Context(), target, args...); err != nil {
		writeBrowserError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"success":true}`))
}

func (h *HandlerHttp) containerFilesUpload(w http.ResponseWriter, r *http.Request) {
	directory, err := cleanBrowserPath(r.URL.Query().Get("path"))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	filename, err := cleanBrowserName(r.URL.Query().Get("name"))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	if r.ContentLength < 0 {
		http.Error(w, "upload Content-Length is required", http.StatusLengthRequired)
		return
	}
	target, err := h.prepareBrowserTarget(r, true, false)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()

	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() {
		tw := tar.NewWriter(writer)
		err := tw.WriteHeader(&tar.Header{Name: filename, Mode: 0o644, Size: r.ContentLength, ModTime: time.Now()})
		if err == nil {
			_, err = io.CopyN(tw, r.Body, r.ContentLength)
		}
		err = errors.Join(err, tw.Close())
		done <- err
		_ = writer.CloseWithError(err)
	}()
	_, copyErr := target.cli.CopyToContainer(r.Context(), target.containerID, client.CopyToContainerOptions{
		DestinationPath: targetPath(target.root, directory), Content: reader,
	})
	_ = reader.CloseWithError(copyErr)
	tarErr := <-done
	if err = errors.Join(copyErr, tarErr); err != nil {
		writeBrowserError(w, fmt.Errorf("upload failed: %w", err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HandlerHttp) containerFilesDownload(w http.ResponseWriter, r *http.Request) {
	requested, err := cleanBrowserPath(r.URL.Query().Get("path"))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	target, err := h.prepareBrowserTarget(r, false, false)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()
	cli := target.cli
	result, err := cli.CopyFromContainer(r.Context(), target.containerID, client.CopyFromContainerOptions{SourcePath: targetPath(target.root, requested)})
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer result.Content.Close()
	filename := path.Base(requested)
	if filename == "." || filename == "/" {
		filename = "root"
	}
	if result.Stat.Mode.IsDir() {
		if r.URL.Query().Get("format") == "zip" {
			filename += ".zip"
			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
			if err = tarToZip(w, result.Content); err != nil {
				log.Warn().Err(err).Msg("could not finish folder ZIP download")
			}
			return
		}
		filename += ".tar"
		w.Header().Set("Content-Type", "application/x-tar")
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
		_, _ = io.Copy(w, result.Content)
		return
	}

	tr := tar.NewReader(result.Content)
	for {
		header, nextErr := tr.Next()
		if nextErr != nil {
			writeBrowserError(w, fmt.Errorf("download archive is invalid: %w", nextErr))
			return
		}
		if header.FileInfo().Mode().IsRegular() {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
			_, _ = io.Copy(w, tr)
			return
		}
	}
}

func (h *HandlerHttp) prepareBrowserTarget(r *http.Request, writable, needHelper bool) (browserTarget, error) {
	host, err := hostMid.GetHost(r.Context())
	if err != nil {
		return browserTarget{}, err
	}
	dkSrv, err := h.srv(host)
	if err != nil {
		return browserTarget{}, err
	}
	kind, id := r.PathValue("kind"), r.PathValue("target")
	if kind == "container" {
		if err = h.checkExecAllowed(r.Context(), dkSrv, id); err != nil {
			return browserTarget{}, err
		}
		inspect, inspectErr := dkSrv.Container.Cli().ContainerInspect(r.Context(), id, client.ContainerInspectOptions{})
		if inspectErr != nil {
			return browserTarget{}, inspectErr
		}
		if inspect.Container.State == nil || !inspect.Container.State.Running {
			return browserTarget{}, fmt.Errorf("container must be running to browse files")
		}
		target := browserTarget{cli: dkSrv.Container.Cli(), containerID: id, root: "/", cleanup: func() {}}
		if needHelper {
			target.helperPath, err = installFileHelper(r.Context(), dkSrv.Container.Cli(), id, inspect.Container.Image)
			target.unlink = true
		}
		return target, err
	}
	if kind != "volume" {
		return browserTarget{}, fmt.Errorf("invalid browser target")
	}
	return createVolumeBrowserTarget(r.Context(), dkSrv.Container.Cli(), id, writable)
}

func createVolumeBrowserTarget(ctx context.Context, cli *client.Client, volumeName string, writable bool) (browserTarget, error) {
	if _, err := cli.VolumeInspect(ctx, volumeName, client.VolumeInspectOptions{}); err != nil {
		return browserTarget{}, err
	}
	images, err := cli.ImageList(ctx, client.ImageListOptions{All: true})
	if err != nil {
		return browserTarget{}, fmt.Errorf("list local images: %w", err)
	}
	if len(images.Items) == 0 {
		return browserTarget{}, fmt.Errorf("volume browsing needs an existing local image; Dockman will not pull one implicitly")
	}
	imageID, helperLocal, err := localHelperBase(ctx, cli, images.Items)
	if err != nil {
		return browserTarget{}, err
	}
	random := randomSuffix()
	name := "dockman-file-browser-" + random
	remote := "/.dockman-file-helper"
	created, err := cli.ContainerCreate(ctx, client.ContainerCreateOptions{
		Name:       name,
		Config:     &container.Config{Image: imageID, User: "0", Entrypoint: []string{remote}, Cmd: []string{"hold"}, Labels: map[string]string{fileHelperLabel: "true", dockmanContainerLabel: "false"}},
		HostConfig: &container.HostConfig{AutoRemove: false, ReadonlyRootfs: true, NetworkMode: "none", CapDrop: []string{"ALL"}, SecurityOpt: []string{"no-new-privileges:true"}, Mounts: []mount.Mount{{Type: mount.TypeVolume, Source: volumeName, Target: volumeRoot, ReadOnly: !writable}}},
	})
	if err != nil {
		return browserTarget{}, err
	}
	cleanup := func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, cleanupErr := cli.ContainerRemove(cleanupCtx, created.ID, client.ContainerRemoveOptions{Force: true}); cleanupErr != nil {
			log.Warn().Err(cleanupErr).Str("container", created.ID).Msg("could not remove file browser helper")
		}
	}
	if err = copyHelper(ctx, cli, created.ID, helperLocal, "/", path.Base(remote)); err != nil {
		cleanup()
		return browserTarget{}, err
	}
	if _, err = cli.ContainerStart(ctx, created.ID, client.ContainerStartOptions{}); err != nil {
		cleanup()
		return browserTarget{}, err
	}
	return browserTarget{cli: cli, containerID: created.ID, root: volumeRoot, helperPath: remote, cleanup: cleanup}, nil
}

func installFileHelper(ctx context.Context, cli *client.Client, containerID, imageID string) (string, error) {
	local, err := fileHelperBinary(ctx, cli, imageID)
	if err != nil {
		return "", err
	}
	name := ".dockman-file-helper-" + randomSuffix()
	var lastErr error
	for _, destination := range []string{"/tmp", "/run", "/"} {
		if err = copyHelper(ctx, cli, containerID, local, destination, name); err == nil {
			return path.Join(destination, name), nil
		}
		lastErr = err
	}
	return "", fmt.Errorf("container filesystem cannot host the temporary browser helper (including read-only or unavailable temporary directories): %w", lastErr)
}

func localHelperBase(ctx context.Context, cli *client.Client, images []imageTypes.Summary) (string, string, error) {
	for _, candidate := range images {
		helper, err := fileHelperBinary(ctx, cli, candidate.ID)
		if err == nil {
			return candidate.ID, helper, nil
		}
	}
	return "", "", fmt.Errorf("volume browsing needs an existing local Linux amd64 or arm64 image; Dockman will not pull one implicitly")
}

func fileHelperBinary(ctx context.Context, cli *client.Client, imageID string) (string, error) {
	image, err := cli.ImageInspect(ctx, imageID)
	if err != nil {
		return "", err
	}
	arch := image.Architecture
	if image.Os != "linux" {
		return "", fmt.Errorf("file browser does not support target operating system %q", image.Os)
	}
	if arch != "amd64" && arch != "arm64" {
		return "", fmt.Errorf("file browser does not support target architecture %q", arch)
	}
	return "/usr/local/libexec/dockman-file-helper-" + arch, nil
}

func copyHelper(ctx context.Context, cli *client.Client, containerID, localPath, destination, name string) error {
	file, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return err
	}
	var archive bytes.Buffer
	tw := tar.NewWriter(&archive)
	if err = tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: stat.Size(), ModTime: stat.ModTime()}); err == nil {
		_, err = io.Copy(tw, file)
	}
	if err = errors.Join(err, tw.Close()); err != nil {
		return err
	}
	_, err = cli.CopyToContainer(ctx, containerID, client.CopyToContainerOptions{DestinationPath: destination, Content: &archive})
	return err
}

func (h *HandlerHttp) runFileHelper(ctx context.Context, target browserTarget, command ...string) ([]byte, error) {
	hostCli := target.helperPath
	args := []string{hostCli}
	if target.unlink {
		args = append(args, "--unlink")
	}
	args = append(args, "--root", target.root)
	args = append(args, command...)
	cli := target.cli
	created, err := cli.ExecCreate(ctx, target.containerID, client.ExecCreateOptions{User: "0", AttachStdout: true, AttachStderr: true, Cmd: args})
	if err != nil {
		return nil, err
	}
	attached, err := cli.ExecAttach(ctx, created.ID, client.ExecAttachOptions{})
	if err != nil {
		return nil, err
	}
	defer attached.Close()
	var stdout, stderr bytes.Buffer
	_, copyErr := stdcopy.StdCopy(&stdout, &stderr, attached.Reader)
	inspected, inspectErr := cli.ExecInspect(ctx, created.ID, client.ExecInspectOptions{})
	if err = errors.Join(copyErr, inspectErr); err != nil {
		return nil, err
	}
	if inspected.ExitCode != 0 {
		return nil, fmt.Errorf("file operation failed: %s", strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

func cleanBrowserPath(value string) (string, error) {
	if value == "" {
		value = "/"
	}
	if strings.IndexByte(value, 0) >= 0 {
		return "", fmt.Errorf("path contains a NUL byte")
	}
	for _, part := range strings.Split(strings.ReplaceAll(value, "\\", "/"), "/") {
		if part == ".." {
			return "", fmt.Errorf("parent traversal is not allowed")
		}
	}
	return path.Clean("/" + value), nil
}

func cleanBrowserName(value string) (string, error) {
	if value == "" || value == "." || value == ".." || path.Base(value) != value || strings.ContainsAny(value, "\\\x00") {
		return "", fmt.Errorf("invalid file name")
	}
	return value, nil
}

func targetPath(root, requested string) string {
	if root == "/" {
		return requested
	}
	return path.Join(root, strings.TrimPrefix(requested, "/"))
}

func tarToZip(destination io.Writer, source io.Reader) error {
	zipped := zip.NewWriter(destination)
	tared := tar.NewReader(source)
	for {
		header, err := tared.Next()
		if err == io.EOF {
			return zipped.Close()
		}
		if err != nil {
			return errors.Join(err, zipped.Close())
		}
		zipHeader, err := zip.FileInfoHeader(header.FileInfo())
		if err != nil {
			return errors.Join(err, zipped.Close())
		}
		zipHeader.Name = strings.TrimPrefix(path.Clean("/"+header.Name), "/")
		zipHeader.Method = zip.Deflate
		entry, err := zipped.CreateHeader(zipHeader)
		if err != nil {
			return errors.Join(err, zipped.Close())
		}
		if header.FileInfo().Mode().IsRegular() {
			if _, err = io.Copy(entry, tared); err != nil {
				return errors.Join(err, zipped.Close())
			}
		}
	}
}

func randomSuffix() string {
	var raw [6]byte
	_, _ = rand.Read(raw[:])
	return hex.EncodeToString(raw[:])
}

func writeBrowserError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	message := err.Error()
	lower := strings.ToLower(message)
	if strings.Contains(lower, "permission denied") || strings.Contains(lower, "read-only") || strings.Contains(lower, "disabled by policy") {
		status = http.StatusForbidden
	}
	http.Error(w, message, status)
}
