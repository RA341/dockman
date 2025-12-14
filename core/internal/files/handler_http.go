package files

import (
	b64 "encoding/base64"
	"fmt"
	"net/http"

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
	subMux.HandleFunc("GET /search", h.searchFile)

	return subMux
}

const QueryKeyAlias = "alias"

func (h *FileHandler) loadFile(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		http.Error(w, "Filename not provided", http.StatusBadRequest)
		return
	}

	alias := r.URL.Query().Get(QueryKeyAlias)
	fullpath, err := h.srv.LoadFilePath(filename, alias)
	if err != nil {
		log.Error().Err(err).Str("path", fullpath).Msg("Error loading file")
		http.Error(w, "Filename not found", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, fullpath)
}

func (h *FileHandler) saveFile(w http.ResponseWriter, r *http.Request) {
	// 10 MB is the maximum upload size
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		log.Fatal().Err(err).Msg("Error parsing multipart form")
		http.Error(w, "Could not parse multipart form", http.StatusBadRequest)
		return
	}

	file, meta, err := r.FormFile(fileContentsFormKey)
	if err != nil {
		log.Error().Err(err).Msg("Error retrieving file from form")
		http.Error(w, "Error retrieving file from form", http.StatusBadRequest)
		return
	}
	defer fu.Close(file)

	decodedFileName, err := b64.StdEncoding.DecodeString(meta.Filename)
	if err != nil {
		http.Error(w, "Error converting file name from base64", http.StatusBadRequest)
		return
	}

	alias := r.URL.Query().Get(QueryKeyAlias)

	err = h.srv.Save(string(decodedFileName), alias, file)
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

func (h *FileHandler) searchFile(w http.ResponseWriter, r *http.Request) {
	alias := r.URL.Query().Get(QueryKeyAlias)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)

	all, err := h.srv.listAll(alias)
	if err != nil {
		wsu.WsErr(ws, fmt.Errorf("Unable to list files "+err.Error()))
		return
	}

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Err(err).Msg("Error reading message")
			break
		}
		query := string(msg)

		results := h.srv.search(query, all, 20)

		err = ws.WriteJSON(results)
		if err != nil {
			err = ws.WriteJSON(map[string]string{"error": err.Error()})
			if err != nil {
				log.Warn().Err(err).Msg("Error writing results to websocket")
			}
			return
		}
	}
}
