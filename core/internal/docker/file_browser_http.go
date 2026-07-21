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
	"sync"
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
	archiveListMax  = 128 << 20
)

type browserTarget struct {
	cli          *client.Client
	containerID  string
	root         string
	helperPath   string
	unlink       bool
	native       bool
	readOnly     bool
	rootReadOnly bool
	defaultUser  string
	cleanup      func()
}

type browserAction struct {
	Action    string `json:"action"`
	Path      string `json:"path"`
	NewPath   string `json:"newPath"`
	Mode      string `json:"mode"`
	UID       *int   `json:"uid"`
	GID       *int   `json:"gid"`
	Recursive bool   `json:"recursive"`
}

func (h *HandlerHttp) containerFilesList(w http.ResponseWriter, r *http.Request) {
	requested, err := cleanBrowserPath(r.URL.Query().Get("path"))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	target, err := h.prepareBrowserTarget(r, false, true, requested)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()
	var stdout []byte
	if target.native {
		stdout, err = nativeFileList(r.Context(), target, requested)
	} else {
		stdout, err = h.runFileHelper(r.Context(), target, "list", requested)
	}
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	var response map[string]any
	if err = json.Unmarshal(stdout, &response); err != nil {
		writeBrowserError(w, fmt.Errorf("invalid file listing response: %w", err))
		return
	}
	response["readOnly"] = target.readOnly
	response["rootReadOnly"] = target.rootReadOnly
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
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
	case "chown":
		if input.UID == nil || input.GID == nil || !validUnixID(*input.UID) || !validUnixID(*input.GID) {
			writeBrowserError(w, fmt.Errorf("uid and gid must be integers between 0 and 4294967294"))
			return
		}
		args = append(args, strconv.Itoa(*input.UID), strconv.Itoa(*input.GID), strconv.FormatBool(input.Recursive))
	default:
		writeBrowserError(w, fmt.Errorf("unsupported file action"))
		return
	}

	paths := []string{requested}
	if input.Action == "rename" {
		paths = append(paths, args[2])
	}
	target, err := h.prepareBrowserTarget(r, true, true, paths...)
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()
	if target.native {
		err = nativeFileAction(r.Context(), target, input, requested, args)
	} else {
		_, err = h.runFileHelper(r.Context(), target, args...)
	}
	if err != nil {
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
	target, err := h.prepareBrowserTarget(r, true, false, path.Join(directory, filename))
	if err != nil {
		writeBrowserError(w, err)
		return
	}
	defer target.cleanup()
	if target.native {
		if err = nativeFileUpload(r.Context(), target, targetPath(target.root, directory), filename, r.Body, r.ContentLength); err != nil {
			writeBrowserError(w, fmt.Errorf("upload failed: %w", err))
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

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
	target, err := h.prepareBrowserTarget(r, false, false, requested)
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

func (h *HandlerHttp) prepareBrowserTarget(r *http.Request, writable, needHelper bool, requestedPaths ...string) (browserTarget, error) {
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
		rootReadOnly := inspect.Container.HostConfig != nil && inspect.Container.HostConfig.ReadonlyRootfs
		requested := "/"
		if len(requestedPaths) > 0 {
			requested = requestedPaths[0]
		}
		readOnly := containerPathReadOnly(rootReadOnly, inspect.Container.Mounts, requested)
		if writable {
			for _, candidate := range requestedPaths {
				if containerPathReadOnly(rootReadOnly, inspect.Container.Mounts, candidate) {
					return browserTarget{}, fmt.Errorf("path %q is on a read-only container filesystem or mount", candidate)
				}
			}
		}
		defaultUser := ""
		if inspect.Container.Config != nil {
			defaultUser = inspect.Container.Config.User
		}
		target := browserTarget{cli: dkSrv.Container.Cli(), containerID: id, root: "/", native: readOnly, readOnly: readOnly, rootReadOnly: rootReadOnly, defaultUser: defaultUser, cleanup: func() {}}
		if needHelper && !readOnly {
			target.helperPath, err = installFileHelper(r.Context(), dkSrv.Container.Cli(), id, inspect.Container.Image, rootReadOnly, inspect.Container.Mounts, requested)
			if err == nil {
				target.unlink = true
			} else {
				// Keep browsing useful for unusual mount namespaces, noexec
				// filesystems and immutable images. Reads can still use native
				// tools or the bounded Docker archive fallback.
				target.native = true
				err = nil
			}
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
		Name:   name,
		Config: &container.Config{Image: imageID, User: "0", Entrypoint: []string{remote}, Cmd: []string{"hold"}, Labels: map[string]string{fileHelperLabel: "true", dockmanContainerLabel: "false"}},
		HostConfig: &container.HostConfig{
			AutoRemove:  false,
			NetworkMode: "none",
			CapDrop:     []string{"ALL"},
			// The helper only receives the filesystem capabilities required to
			// browse and manage files owned by arbitrary volume UIDs. It has no
			// network, device, namespace or Docker administration capability.
			CapAdd:      []string{"CHOWN", "DAC_OVERRIDE", "DAC_READ_SEARCH", "FOWNER"},
			SecurityOpt: []string{"no-new-privileges:true"},
			Mounts:      []mount.Mount{{Type: mount.TypeVolume, Source: volumeName, Target: volumeRoot, ReadOnly: !writable}},
		},
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

func installFileHelper(ctx context.Context, cli *client.Client, containerID, imageID string, rootReadOnly bool, mounts []container.MountPoint, requested string) (string, error) {
	local, err := fileHelperBinary(ctx, cli, imageID)
	if err != nil {
		return "", err
	}
	name := ".dockman-file-helper-" + randomSuffix()
	var lastErr error
	for _, destination := range helperDestinations(rootReadOnly, mounts, requested) {
		remote := path.Join(destination, name)
		if err = copyHelper(ctx, cli, containerID, local, destination, name); err != nil {
			lastErr = err
			continue
		}
		// CopyToContainer can write behind a tmpfs/bind mount and report
		// success even though a process in the container cannot see the file.
		// A real exec also rejects noexec mounts before we select the path.
		_, err = runContainerCommandAsUser(ctx, browserTarget{cli: cli, containerID: containerID}, []string{remote, "--root", "/", "probe"}, "0")
		if err == nil {
			return remote, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no writable helper destination is visible in the container")
	}
	return "", fmt.Errorf("container filesystem cannot host the temporary browser helper (including read-only or unavailable temporary directories): %w", lastErr)
}

func helperDestinations(rootReadOnly bool, mounts []container.MountPoint, requested string) []string {
	var candidates []string
	if mounted := effectiveContainerMount(mounts, requested); rootReadOnly && mounted != nil && mounted.RW {
		candidates = append(candidates, path.Clean(mounted.Destination))
	}
	for _, candidate := range []string{"/tmp", "/run", "/"} {
		if !containerPathReadOnly(rootReadOnly, mounts, candidate) {
			candidates = append(candidates, candidate)
		}
	}
	seen := make(map[string]bool, len(candidates))
	unique := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate == "." || seen[candidate] {
			continue
		}
		seen[candidate] = true
		unique = append(unique, candidate)
	}
	return unique
}

func validUnixID(value int) bool {
	return value >= 0 && uint64(value) <= uint64(^uint32(0)-1)
}

func containerPathReadOnly(rootReadOnly bool, mounts []container.MountPoint, requested string) bool {
	mounted := effectiveContainerMount(mounts, requested)
	if mounted != nil {
		return !mounted.RW
	}
	return rootReadOnly
}

func effectiveContainerMount(mounts []container.MountPoint, requested string) *container.MountPoint {
	requested = path.Clean("/" + strings.TrimPrefix(requested, "/"))
	best := -1
	bestLength := -1
	for index := range mounts {
		if strings.TrimSpace(mounts[index].Destination) == "" {
			continue
		}
		destination := path.Clean("/" + strings.TrimPrefix(mounts[index].Destination, "/"))
		inside := destination == "/" || requested == destination || strings.HasPrefix(requested, destination+"/")
		if inside && len(destination) > bestLength {
			best, bestLength = index, len(destination)
		}
	}
	if best < 0 {
		return nil
	}
	return &mounts[best]
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
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = strings.TrimSpace(stdout.String())
		}
		if detail == "" {
			detail = fmt.Sprintf("helper exited with code %d", inspected.ExitCode)
		}
		return nil, fmt.Errorf("file operation failed: %s", detail)
	}
	return stdout.Bytes(), nil
}

type browserEntry struct {
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	Size        int64   `json:"size"`
	Mode        string  `json:"mode"`
	Permissions string  `json:"permissions"`
	Modified    string  `json:"modified"`
	UID         *uint32 `json:"uid"`
	GID         *uint32 `json:"gid"`
	LinkTarget  string  `json:"linkTarget,omitempty"`
}

func nativeFileList(ctx context.Context, target browserTarget, requested string) ([]byte, error) {
	var names []string
	if output, err := runNativeCommand(ctx, target, "find", requested, "-mindepth", "1", "-maxdepth", "1", "-print0"); err == nil {
		for _, raw := range bytes.Split(output, []byte{0}) {
			value := string(raw)
			if value == "" {
				continue
			}
			names = append(names, path.Base(value))
		}
	} else {
		output, listErr := runNativeCommand(ctx, target, "ls", "-A1", requested)
		if listErr != nil {
			archive, archiveErr := archiveFileList(ctx, target, requested)
			if archiveErr == nil {
				return archive, nil
			}
			return nil, fmt.Errorf("unable to list the directory with container tools or the bounded Docker archive fallback: %w", errors.Join(err, listErr, archiveErr))
		}
		for _, value := range strings.Split(strings.TrimSuffix(string(output), "\n"), "\n") {
			if value != "" {
				names = append(names, value)
			}
		}
	}

	entries := make([]browserEntry, len(names))
	valid := make([]bool, len(names))
	jobs := make(chan int)
	var workers sync.WaitGroup
	workerCount := min(12, max(1, len(names)))
	for range workerCount {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				name := names[index]
				if name == "." || name == ".." || strings.Contains(name, "/") {
					continue
				}
				result, statErr := target.cli.ContainerStatPath(ctx, target.containerID, client.ContainerStatPathOptions{Path: path.Join(requested, name)})
				if statErr != nil {
					// /proc and /dev are inherently racy: entries can vanish,
					// be broken symlinks, or be unsupported by Docker's archive
					// stat endpoint. Preserve the name without failing the whole
					// directory; a refresh may resolve it on the next pass.
					entries[index] = unavailableBrowserEntry(name)
					valid[index] = true
					continue
				}
				stat := result.Stat
				kind := "file"
				switch {
				case stat.Mode.IsDir():
					kind = "directory"
				case stat.Mode&os.ModeSymlink != 0:
					kind = "symlink"
				case !stat.Mode.IsRegular():
					kind = "other"
				}
				entries[index] = browserEntry{
					Name: name, Type: kind, Size: stat.Size, Mode: fmt.Sprintf("%03o", stat.Mode.Perm()),
					Permissions: stat.Mode.String(), Modified: stat.Mtime.UTC().Format(time.RFC3339Nano), LinkTarget: stat.LinkTarget,
				}
				valid[index] = true
			}
		}()
	}
	for index := range names {
		jobs <- index
	}
	close(jobs)
	workers.Wait()
	outputEntries := make([]browserEntry, 0, len(entries))
	for index, entry := range entries {
		if valid[index] {
			outputEntries = append(outputEntries, entry)
		}
	}
	return json.Marshal(struct {
		Path    string         `json:"path"`
		Entries []browserEntry `json:"entries"`
	}{Path: requested, Entries: outputEntries})
}

func unavailableBrowserEntry(name string) browserEntry {
	return browserEntry{Name: name, Type: "other", Size: -1, Mode: "---", Permissions: "??????????"}
}

func archiveFileList(ctx context.Context, target browserTarget, requested string) ([]byte, error) {
	result, err := target.cli.CopyFromContainer(ctx, target.containerID, client.CopyFromContainerOptions{SourcePath: requested})
	if err != nil {
		return nil, err
	}
	defer result.Content.Close()
	return parseArchiveFileList(result.Content, requested)
}

func parseArchiveFileList(source io.Reader, requested string) ([]byte, error) {
	limited := &io.LimitedReader{R: source, N: archiveListMax + 1}
	reader := tar.NewReader(limited)
	entries := make(map[string]browserEntry)
	rootPrefix := ""
	first := true
	for {
		header, nextErr := reader.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			if limited.N <= 0 {
				return nil, fmt.Errorf("directory archive exceeds the %d MiB safe listing limit", archiveListMax>>20)
			}
			return nil, nextErr
		}
		name := strings.TrimPrefix(path.Clean("/"+header.Name), "/")
		if first {
			first = false
			if name == "." || name == path.Base(requested) {
				if name != "." {
					rootPrefix = name + "/"
				}
				continue
			}
		}
		name = strings.TrimPrefix(name, rootPrefix)
		if name == "" || name == "." {
			continue
		}
		child, remainder, _ := strings.Cut(name, "/")
		if child == "" || child == "." {
			continue
		}
		if remainder != "" {
			if _, exists := entries[child]; !exists {
				entries[child] = browserEntry{Name: child, Type: "directory", Mode: "---", Permissions: "d---------", Modified: header.ModTime.UTC().Format(time.RFC3339Nano)}
			}
			continue
		}
		mode := header.FileInfo().Mode()
		kind := "file"
		switch {
		case mode.IsDir():
			kind = "directory"
		case mode&os.ModeSymlink != 0:
			kind = "symlink"
		case !mode.IsRegular():
			kind = "other"
		}
		uid, gid := uint32(max(header.Uid, 0)), uint32(max(header.Gid, 0))
		entries[child] = browserEntry{
			Name: child, Type: kind, Size: header.Size, Mode: fmt.Sprintf("%03o", mode.Perm()), Permissions: mode.String(),
			Modified: header.ModTime.UTC().Format(time.RFC3339Nano), UID: &uid, GID: &gid, LinkTarget: header.Linkname,
		}
	}
	if limited.N <= 0 {
		return nil, fmt.Errorf("directory archive exceeds the %d MiB safe listing limit", archiveListMax>>20)
	}
	output := make([]browserEntry, 0, len(entries))
	for _, entry := range entries {
		output = append(output, entry)
	}
	return json.Marshal(struct {
		Path    string         `json:"path"`
		Entries []browserEntry `json:"entries"`
	}{Path: requested, Entries: output})
}

func nativeFileAction(ctx context.Context, target browserTarget, input browserAction, requested string, helperArgs []string) error {
	var command string
	var args []string
	switch input.Action {
	case "create-file":
		command, args = "touch", []string{requested}
	case "create-folder":
		command, args = "mkdir", []string{requested}
	case "rename":
		command, args = "mv", []string{requested, helperArgs[2]}
	case "delete":
		if requested == "/" {
			return fmt.Errorf("refusing to delete the browser root")
		}
		command, args = "rm", []string{"-rf", requested}
	case "chmod":
		command, args = "chmod", []string{input.Mode, requested}
		if input.Recursive {
			args = append([]string{"-R"}, args...)
		}
	case "chown":
		if input.UID == nil || input.GID == nil {
			return fmt.Errorf("uid and gid are required")
		}
		command, args = "chown", []string{fmt.Sprintf("%d:%d", *input.UID, *input.GID), requested}
		if input.Recursive {
			args = append([]string{"-R"}, args...)
		}
	default:
		return fmt.Errorf("unsupported file action")
	}
	_, err := runNativeCommand(ctx, target, command, args...)
	return err
}

func nativeFileUpload(ctx context.Context, target browserTarget, directory, filename string, content io.Reader, size int64) error {
	commands := nativeCommandCandidates(ctx, target, "dd")
	if len(commands) == 0 {
		return fmt.Errorf("read-only compatibility mode needs dd in the container to upload into writable mounts")
	}
	cmd := append(commands[0], "of="+path.Join(directory, filename))
	created, err := target.cli.ExecCreate(ctx, target.containerID, client.ExecCreateOptions{
		User: "", AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: cmd,
	})
	if err != nil {
		return err
	}
	attached, err := target.cli.ExecAttach(ctx, created.ID, client.ExecAttachOptions{})
	if err != nil {
		return err
	}
	defer attached.Close()
	var stderr bytes.Buffer
	readDone := make(chan error, 1)
	go func() {
		_, copyErr := stdcopy.StdCopy(io.Discard, &stderr, attached.Reader)
		readDone <- copyErr
	}()
	_, writeErr := io.CopyN(attached.Conn, content, size)
	closeErr := attached.CloseWrite()
	readErr := <-readDone
	inspected, inspectErr := target.cli.ExecInspect(ctx, created.ID, client.ExecInspectOptions{})
	if err = errors.Join(writeErr, closeErr, readErr, inspectErr); err != nil {
		return err
	}
	if inspected.ExitCode != 0 {
		return fmt.Errorf("file operation failed: %s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

func runNativeCommand(ctx context.Context, target browserTarget, name string, args ...string) ([]byte, error) {
	commands := nativeCommandCandidates(ctx, target, name)
	if len(commands) == 0 {
		return nil, fmt.Errorf("%s is not available in the container", name)
	}
	var failures []error
	for _, prefix := range commands {
		output, err := runContainerCommand(ctx, target, append(prefix, args...))
		if err == nil {
			return output, nil
		}
		failures = append(failures, err)
	}
	return nil, fmt.Errorf("%s failed with %d available executable(s): %w", name, len(commands), failures[0])
}

func nativeCommandCandidates(ctx context.Context, target browserTarget, name string) [][]string {
	paths := []string{"/bin/" + name, "/usr/bin/" + name, "/usr/sbin/" + name, "/sbin/" + name}
	commands := make([][]string, 0, len(paths)+2)
	for _, candidate := range paths {
		if _, err := target.cli.ContainerStatPath(ctx, target.containerID, client.ContainerStatPathOptions{Path: candidate}); err == nil {
			commands = append(commands, []string{candidate})
		}
	}
	for _, busybox := range []string{"/bin/busybox", "/usr/bin/busybox"} {
		if _, err := target.cli.ContainerStatPath(ctx, target.containerID, client.ContainerStatPathOptions{Path: busybox}); err == nil {
			commands = append(commands, []string{busybox, name})
		}
	}
	return commands
}

func runContainerCommand(ctx context.Context, target browserTarget, command []string) ([]byte, error) {
	output, err := runContainerCommandAsUser(ctx, target, command, "")
	if err == nil {
		return output, nil
	}
	configuredUser := strings.TrimSpace(strings.Split(target.defaultUser, ":")[0])
	if configuredUser == "" || configuredUser == "0" || strings.EqualFold(configuredUser, "root") {
		return nil, err
	}
	rootOutput, rootErr := runContainerCommandAsUser(ctx, target, command, "0")
	if rootErr == nil {
		return rootOutput, nil
	}
	if err.Error() == rootErr.Error() {
		return nil, err
	}
	return nil, errors.Join(err, rootErr)
}

func runContainerCommandAsUser(ctx context.Context, target browserTarget, command []string, user string) ([]byte, error) {
	created, err := target.cli.ExecCreate(ctx, target.containerID, client.ExecCreateOptions{User: user, AttachStdout: true, AttachStderr: true, Cmd: command})
	if err != nil {
		return nil, err
	}
	attached, err := target.cli.ExecAttach(ctx, created.ID, client.ExecAttachOptions{})
	if err != nil {
		return nil, err
	}
	defer attached.Close()
	var stdout, stderr bytes.Buffer
	_, copyErr := stdcopy.StdCopy(&stdout, &stderr, attached.Reader)
	inspected, inspectErr := target.cli.ExecInspect(ctx, created.ID, client.ExecInspectOptions{})
	if err = errors.Join(copyErr, inspectErr); err != nil {
		return nil, err
	}
	if inspected.ExitCode != 0 {
		return nil, fmt.Errorf("%s: %s", strings.Join(command, " "), strings.TrimSpace(stderr.String()))
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
