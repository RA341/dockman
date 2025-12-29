package argos

import (
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	ColorReset     = "\033[0m"
	ColorBold      = "\033[1m"
	ColorUnderline = "\033[4m"

	ColorRed     = "\033[31m"
	ColorGreen   = "\033[32m" // For string values
	ColorYellow  = "\033[33m" // For bools
	ColorBlue    = "\033[34m" // For keys
	ColorMagenta = "\033[35m" // For numbers
	ColorCyan    = "\033[36m"
)

// KeyValue A simple struct to hold our flattened key-value pairs before formatting.
type KeyValue struct {
	Key         string
	Value       string
	HelpMessage string
	EnvName     string
}

func PrettyPrint(c interface{}, baseEnv string) {
	// Flatten the struct into a list of KeyValue pairs.
	// We start with an empty prefix for the top-level keys.
	pairs := flattenStruct(reflect.ValueOf(c), "", baseEnv)

	// Find the length of the longest key for alignment.
	maxKeyLength := 0
	maxValueLength := 0
	maxHelpLength := 0
	for _, p := range pairs {
		if len(p.Key) > maxKeyLength {
			maxKeyLength = len(p.Key)
		}

		// strip ANSI color codes to get the true visible length of the value.
		cleanValue := ansiRegex.ReplaceAllString(p.Value, "")
		if len(cleanValue) > maxValueLength {
			maxValueLength = len(cleanValue)
		}

		cleanHelpValue := ansiRegex.ReplaceAllString(p.HelpMessage, "")
		if len(cleanHelpValue) > maxHelpLength {
			maxHelpLength = len(cleanHelpValue)
		}
	}

	// Format each pair into a colored, aligned string.
	redEnvLabel := Colorize("Env:", ColorRed+ColorUnderline)
	var contentBuilder strings.Builder
	for i, p := range pairs {
		// Calculate padding for the key column
		keyPadding := strings.Repeat(" ", maxKeyLength-len(p.Key))

		// Calculate padding for the value column
		cleanValue := ansiRegex.ReplaceAllString(p.Value, "")
		valuePadding := strings.Repeat(" ", maxValueLength-len(cleanValue))

		// Colorize parts for readability
		coloredKey := Colorize(p.Key, ColorBlue+ColorBold)

		cleanHelp := ansiRegex.ReplaceAllString(p.HelpMessage, "")
		helpPadding := strings.Repeat(" ", maxHelpLength-len(cleanHelp))

		// Assemble the line with calculated padding
		// Format: [Key]:[Padding]  [Value][Padding]   [Help]
		contentBuilder.WriteString(coloredKey)
		contentBuilder.WriteString(":")
		contentBuilder.WriteString(keyPadding)
		contentBuilder.WriteString("  ") // Separator between key and value

		contentBuilder.WriteString(p.Value)
		contentBuilder.WriteString(valuePadding)
		contentBuilder.WriteString("  ") // Separator between value and help

		contentBuilder.WriteString(p.HelpMessage)
		contentBuilder.WriteString(helpPadding)
		contentBuilder.WriteString("  ") // Separator between help and env

		contentBuilder.WriteString(fmt.Sprintf("%s %s", redEnvLabel, p.EnvName))

		if i < len(pairs)-1 {
			contentBuilder.WriteString("\n")
		}
	}

	ms := Colorize("To modify config, set the respective", ColorMagenta+ColorBold)
	contentBuilder.WriteString(fmt.Sprintf("\n\n%s %s", ms, redEnvLabel))

	printInBox("Config", contentBuilder.String())
}

// flattenStruct recursively traverses a struct and returns a flat list of KeyValue pairs.
func flattenStruct(v reflect.Value, prefix, baseEnv string) []KeyValue {
	// If it's a pointer, dereference it.
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	prefixer := Prefixer(baseEnv)

	var pairs []KeyValue
	t := v.Type()
	for i := 0; i < v.NumField(); i++ {
		fieldT := t.Field(i)
		fieldV := v.Field(i)

		keyName := fieldT.Name
		configTag, ok := fieldT.Tag.Lookup("config")
		if !ok {
			continue // Skip fields without the config tag
		}

		// Create the full key path (e.g., "database.host")
		fullKey := keyName
		if prefix != "" {
			fullKey = prefix + "." + keyName
		}

		if fieldV.Kind() == reflect.Struct {
			nestedPairs := flattenStruct(fieldV, fullKey, baseEnv)
			pairs = append(pairs, nestedPairs...)
			continue // Important: move to the next field after handling the struct
		}

		configTags := parseTag(configTag)
		usage := configTags["usage"]
		hide := configTags["hide"]
		envName := Colorize(prefixer(configTags["env"]), ColorCyan)
		message := fmt.Sprintf("%s", Colorize(usage, ColorBlue))

		var val KeyValue
		switch fieldV.Kind() {
		case reflect.Slice:
			// Format slices as comma-separated strings
			var sliceItems []string
			for j := 0; j < fieldV.Len(); j++ {
				sliceItems = append(sliceItems, formatSimpleValue(fieldV.Index(j)))
			}
			val = KeyValue{
				Key:         fullKey,
				Value:       strings.Join(sliceItems, ", "),
				HelpMessage: message,
				EnvName:     envName,
			}
		default:
			// Handle simple types
			val = KeyValue{
				Key:         fullKey,
				Value:       formatSimpleValue(fieldV),
				HelpMessage: message,
				EnvName:     envName,
			}
		}

		if hide != "" {
			val.Value = Colorize("*REDACTED* ^_^", ColorRed)
		}
		pairs = append(pairs, val)
	}
	return pairs
}

func Prefixer(baseEnv string) func(env string) string {
	return func(env string) string {
		return fmt.Sprintf("%s_%s", baseEnv, env)
	}
}

// formatSimpleValue converts a reflect.Value of a simple type to a colored string.
func formatSimpleValue(v reflect.Value) string {
	switch v.Kind() {
	case reflect.String:
		return Colorize(v.String(), ColorGreen)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return Colorize(strconv.FormatInt(v.Int(), 10), ColorMagenta)
	case reflect.Bool:
		return Colorize(strconv.FormatBool(v.Bool()), ColorYellow)
	default:
		if v.IsValid() {
			return v.String()
		}
		return Colorize("null", "red") // Should not happen with valid structs
	}
}

func Colorize(s, color string) string {
	return color + s + ColorReset
}

const (
	topLeft     = "╭"
	topRight    = "╮"
	bottomLeft  = "╰"
	bottomRight = "╯"
	horizontal  = "─"
	vertical    = "│"
	space       = " "
	hPadding    = 2 // Horizontal padding on each side
	vPadding    = 1 // Vertical padding (empty lines top/bottom)
)

var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[mK]`)

func printInBox(title, content string) {
	lines := strings.Split(content, "\n")
	maxWidth := utf8.RuneCountInString(title)
	for _, line := range lines {
		cleanLine := ansiRegex.ReplaceAllString(line, "")
		if width := utf8.RuneCountInString(cleanLine); width > maxWidth {
			maxWidth = width
		}
	}
	innerWidth := maxWidth + (hPadding * 2)

	titleBar := buildTitleBar(title, innerWidth, horizontal, space)
	fmt.Println(topLeft + titleBar + topRight)

	printPaddedLine(innerWidth, vertical, space)

	for _, line := range lines {
		cleanLine := ansiRegex.ReplaceAllString(line, "")
		visibleWidth := utf8.RuneCountInString(cleanLine)
		paddingNeeded := innerWidth - visibleWidth

		fmt.Printf("%s%s%s%s%s\n",
			vertical,
			strings.Repeat(space, hPadding),
			line,
			strings.Repeat(space, paddingNeeded-hPadding),
			vertical,
		)
	}

	printPaddedLine(innerWidth, vertical, space)
	fmt.Println(bottomLeft + strings.Repeat(horizontal, innerWidth) + bottomRight)
}

func buildTitleBar(title string, innerWidth int, char, space string) string {
	titleText := space + title + space
	titleWidth := utf8.RuneCountInString(titleText)
	if titleWidth >= innerWidth {
		return titleText[:innerWidth]
	}
	padding := innerWidth - titleWidth
	return strings.Repeat(char, padding/2) + titleText + strings.Repeat(char, padding-(padding/2))
}

func printPaddedLine(innerWidth int, vertical, space string) {
	fmt.Println(vertical + strings.Repeat(space, innerWidth) + vertical)
}
