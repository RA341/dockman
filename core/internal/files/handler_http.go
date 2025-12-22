package files

import (
	b64 "encoding/base64"
	"net/http"
	"strconv"

	"github.com/RA341/dockman/internal/host"
	fu "github.com/RA341/dockman/pkg/fileutil"
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
	subMux.HandleFunc("GET /search/{host}/{root}", h.searchFile)

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
	getHost, err := host.GetHost(r.Context())
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
		http.Error(w, "Filename not found", http.StatusBadRequest)
		return
	}
	defer fu.Close(reader)

	http.ServeContent(w, r, filename, modTime, reader)
}

func (h *FileHandler) saveFile(w http.ResponseWriter, r *http.Request) {
	// 10 MB is the maximum upload size
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		log.Fatal().Err(err).Msg("Error parsing multipart form")
		http.Error(w, "Could not parse multipart form", http.StatusBadRequest)
		return
	}

	getHost, err := host.GetHost(r.Context())
	if err != nil {
		http.Error(w, "host not provided", http.StatusBadRequest)
		return
	}

	content, meta, err := r.FormFile(fileContentsFormKey)
	if err != nil {
		log.Error().Err(err).Msg("Error retrieving file from form")
		http.Error(w, "Error retrieving file from form", http.StatusBadRequest)
		return
	}
	defer fu.Close(content)

	decodedFileName, err := b64.StdEncoding.DecodeString(meta.Filename)
	if err != nil {
		http.Error(w, "Error converting file name from base64", http.StatusBadRequest)
		return
	}

	createFile := false
	createStr := r.URL.Query().Get(QueryKeyCreate)
	if createStr != "" {
		createFile, err = strconv.ParseBool(createStr)
		if err != nil {
			log.Warn().Err(err).Str("param", createStr).Msg("Error converting create query param to bool")
			createFile = false
		}
	}

	err = h.srv.Save(string(decodedFileName), getHost, createFile, content)
	if err != nil {
		log.Error().Err(err).Msg("Error saving file")
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}

	//log.Debug().Str("filename", meta.Filename).Msg("Successfully saved File")
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error"`
}

func (h *FileHandler) searchFile(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("root")
	if filename == "" {
		http.Error(w, "root not provided for search", http.StatusBadRequest)
		return
	}
	getHost := r.PathValue("host")
	if getHost == "" {
		http.Error(w, "host not provided", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)

	var response SearchResponse

	all, err := h.srv.listAll(filename, getHost)
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

		results := h.srv.search(query, all)
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
