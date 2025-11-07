package files

import (
	"fmt"

	"github.com/google/yamlfmt/formatters/basic"
)

type FormatFn func(contents []byte) ([]byte, error)
type Formatters map[string]FormatFn

var availableFormatters Formatters = map[string]FormatFn{
	".yaml": yamlFormatter,
	".yml":  yamlFormatter,
}

// todo look into this
// --- Variant B: create a ConsecutiveEngine and use FormatContent ---
//
//	eng := &engine.ConsecutiveEngine{
//		Formatter:        formatter,
//		LineSepCharacter: "\n", // or "\r\n"
//		// Quiet, Verbose, ContinueOnError, OutputFormat are optional for FormatContent
//	}
//
// out2, err := eng.FormatContent(input)
//
//	if err != nil {
//		log.Fatalf("engine format error: %v", err)
//	}
//
// fmt.Println("Formatted (engine.FormatContent):")
// fmt.Println(string(out2))
func yamlFormatter(contents []byte) ([]byte, error) {
	factory := &basic.BasicFormatterFactory{}
	formatter, err := factory.NewFormatter(map[string]interface{}{
		"indent":             2,
		"retain_line_breaks": true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create formatter: %v", err)
	}

	out, err := formatter.Format(contents)
	if err != nil {
		return nil, fmt.Errorf("failed to format: %v", err)
	}

	return out, nil
}
