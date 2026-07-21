package files

import (
	b64 "encoding/base64"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"strconv"

	"github.com/RA341/dockman/internal/host/middleware"
	fu "github.com/RA341/dockman/pkg/fileutil"
	wsu "github.com/RA341/dockman/pkg/ws"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const fileContentsFormKey = "contents"

type FileHandler struct {
	srv *Service
}

func NewFileHandler(service *Service) http.Handler {
	hand := &FileHandler{srv: service}
	return hand.register()
}

func (h *FileHandler) register() http.Handler {
	subMux := http.NewServeMux()
	subMux.HandleFunc("POST /save", h.saveFile)
	subMux.HandleFunc("GET /load/{filename}", h.loadFile)
	subMux.HandleFunc("GET /search/{root}", h.searchFile)

	return subMux
}

const QueryKeyCreate = "create"
const QueryKeyDownload = "download"

func (h *FileHandler) loadFile(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		http.Error(w, "Filename not provided", http.StatusBadRequest)
		return
	}
	getHost, err := middleware.GetHost(r.Context())
	if err != nil {
		http.Error(w, "host not provided", http.StatusBadRequest)
		return
	}

	downloadStr := r.URL.Query().Get(QueryKeyDownload)
	download := false
	if downloadStr != "" {
		download, _ = strconv.ParseBool(downloadStr)
	}

	reader, modTime, err := h.srv.LoadFilePath(filename, getHost, download)
	if err != nil {
		log.Error().Err(err).Str("path", filename).Msg("Error loading file")
		switch {
		case errors.Is(err, ErrFileNotSupported):
			http.Error(w, "binary file detected, it will not be opened", http.StatusConflict)
		case errors.Is(err, fs.ErrNotExist):
			http.Error(w, "file not found", http.StatusNotFound)
		case errors.Is(err, fs.ErrPermission):
			http.Error(w, "permission denied: the server process cannot read this file. "+
				"Check the file's owner/permissions, or grant the container CAP_DAC_READ_SEARCH.",
				http.StatusForbidden)
		default:
			http.Error(w, "failed to read file", http.StatusInternalServerError)
		}
		return
	}
	defer fu.Close(reader)

	http.ServeContent(w, r, filename, modTime, reader)
}

func (h *FileHandler) saveFile(w http.ResponseWriter, r *http.Request) {
	getHost, err := middleware.GetHost(r.Context())
	if err != nil {
		http.Error(w, "host not provided", http.StatusBadRequest)
		return
	}

	createFile := false
	if createStr := r.URL.Query().Get(QueryKeyCreate); createStr != "" {
		createFile, err = strconv.ParseBool(createStr)
		if err != nil {
			log.Warn().Err(err).Str("param", createStr).Msg("Error converting create query param to bool")
			createFile = false
		}
	}

	// Stream the upload straight to disk. ParseMultipartForm would first buffer
	// the whole file (up to 10 MB in memory, the rest in a temp file) before we
	// write it — under a tight container memory limit a large upload can push
	// the process into an OOM kill. A MultipartReader keeps memory flat.
	reader, err := r.MultipartReader()
	if err != nil {
		log.Error().Err(err).Msg("Error reading multipart body")
		writeUploadError(w, err, "Could not read multipart body", http.StatusBadRequest)
		return
	}

	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			log.Error().Err(err).Msg("Error reading multipart part")
			writeUploadError(w, err, "Error reading upload", http.StatusBadRequest)
			return
		}
		if part.FormName() != fileContentsFormKey {
			_ = part.Close()
			continue
		}

		decodedFileName, err := decodeUploadFilename(part.FileName())
		if err != nil {
			_ = part.Close()
			http.Error(w, "Error converting file name from base64", http.StatusBadRequest)
			return
		}

		if err = h.srv.Save(string(decodedFileName), getHost, createFile, part); err != nil {
			_ = part.Close()
			log.Error().Err(err).
				Str("host", getHost).
				Str("path", string(decodedFileName)).
				Bool("create", createFile).
				Msg("Error saving file")
			switch {
			case errors.Is(err, fs.ErrPermission):
				http.Error(w, "permission denied while saving file", http.StatusForbidden)
			case errors.Is(err, fs.ErrNotExist):
				http.Error(w, "file path not found", http.StatusNotFound)
			case isRequestTooLarge(err):
				http.Error(w, "upload exceeds the configured size limit", http.StatusRequestEntityTooLarge)
			default:
				http.Error(w, "Error saving file", http.StatusInternalServerError)
			}
			return
		}
		_ = part.Close()
		return
	}

	http.Error(w, "no file provided in form", http.StatusBadRequest)
}

func isRequestTooLarge(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

func writeUploadError(w http.ResponseWriter, err error, message string, fallbackStatus int) {
	if isRequestTooLarge(err) {
		http.Error(w, "upload exceeds the configured size limit", http.StatusRequestEntityTooLarge)
		return
	}
	http.Error(w, message, fallbackStatus)
}

func decodeUploadFilename(encoded string) ([]byte, error) {
	decoded, err := b64.RawURLEncoding.DecodeString(encoded)
	if err == nil {
		return decoded, nil
	}

	// Accept uploads from older frontends during rolling upgrades.
	return b64.StdEncoding.DecodeString(encoded)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error"`
}

func (h *FileHandler) searchFile(w http.ResponseWriter, r *http.Request) {
	hostname, err := middleware.GetHost(r.Context())
	if err != nil {
		http.Error(w, "host not provided", http.StatusBadRequest)
		return
	}

	filename := r.PathValue("root")
	if filename == "" {
		http.Error(w, "root not provided for search", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)
	wsu.LimitClientMessages(ws)

	var response SearchResponse

	all, err := h.srv.listAllForSearch(filename, hostname)
	if err != nil {
		response.Error = err.Error()
		writeJason(ws, response)
		return
	}

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Err(err).Msg("Error reading message")
			break
		}
		query := string(msg)

		results := h.srv.search(hostname, query, all)
		response.Results = results

		writeJason(ws, response)
	}
}

// ahh yes the jason protocol
func writeJason(ws *websocket.Conn, response SearchResponse) {
	err := ws.WriteJSON(&response)
	if err != nil {
		log.Warn().Err(err).
			Any("response", response).
			Msg("Error writing search results to websocket")
		return
	}
	return
}
