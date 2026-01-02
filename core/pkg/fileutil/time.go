package fileutil

import (
	"time"

	"github.com/rs/zerolog/log"
)

func GetDurOrDefault(val string, def time.Duration) time.Duration {
	dur, err := time.ParseDuration(val)
	if err != nil {
		log.Warn().Err(err).
			Str("value", val).
			Dur("default", def).
			Msg(`"Couldn't parse cookie expiry
				check docs: https://www.geeksforgeeks.org/go-language/time-parseduration-function-in-golang-with-examples
				using default value`,
			)
		return def
	}

	return dur
}
