package ws

import (
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

type WsWriter struct {
	ws *websocket.Conn
}

func NewWsWriter(ws *websocket.Conn) *WsWriter {
	return &WsWriter{
		ws: ws,
	}
}

func (w *WsWriter) Write(p []byte) (n int, err error) {
	err = w.ws.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		log.Warn().Err(err).Msg("Unable to write to websocket")
		return len(p), err
	}

	return len(p), nil
}

const (
	AnsiGreen  = "\x1b[32m"
	AnsiRed    = "\x1b[31m"
	AnsiReset  = "\x1b[0m"
	AnsiYellow = "\x1b[33m"
	newLine    = "\r\n"
)

func WWrn(ws *websocket.Conn, message string) {
	message = formatTermMessage(message, AnsiYellow)
	WsMustWrite(ws, message)
}

func WInf(ws *websocket.Conn, message string) {
	message = formatTermMessage(message, AnsiGreen)
	WsMustWrite(ws, message)
}

func WErr(ws *websocket.Conn, errMessage error) {
	message := formatTermMessage(errMessage.Error(), AnsiRed)
	WsMustWrite(ws, message)
}

func formatTermMessage(message string, color string) string {
	message = color + message + AnsiReset + newLine
	return message
}

func WsMustWrite(ws *websocket.Conn, message string) {
	err := ws.WriteMessage(websocket.TextMessage, []byte(message))
	if err != nil {
		log.Warn().Err(err).Msg("Failed to write to socket")
		return
	}
}
