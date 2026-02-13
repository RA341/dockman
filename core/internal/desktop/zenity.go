package desktop

import (
	"log"

	"github.com/ncruces/zenity"
)

func ShowErr(errMessage string) {
	err := zenity.Error(
		errMessage,
		zenity.Title("Error Occurred"),
		zenity.ErrorIcon,
	)
	if err != nil {
		log.Fatal(err)
	}
}
