package args

import (
	"flag"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
)

// ParseAndReadFlags calls ParseStruct and then calls flag.Parse
func ParseAndReadFlags(s interface{}, envPrefix string) error {
	if err := ParseStruct(s, envPrefix); err != nil {
		return err
	}

	flag.Parse()
	return nil
}

// ParseStruct uses reflection to iterate over the fields of a struct,
// read the 'config' tags, and set up the corresponding flags.
// and populates it from defaults, environment variables,
// and command-line flags, and then parses the flags.
// The order of precedence is:
// 1. Command-line flags (e.g., -port 9000)
// 2. Environment variables (e.g., DOCKMAN_PORT=9000)
// 3. Default values specified in struct tags.
func ParseStruct(s interface{}, envPrefix string) error {
	// Ensure we have a pointer to a struct
	val := reflect.ValueOf(s)
	if val.Kind() != reflect.Ptr || val.Elem().Kind() != reflect.Struct {
		return fmt.Errorf("expected a pointer to a struct")
	}

	// Get the struct element that the pointer points to
	structVal := val.Elem()
	structType := structVal.Type()

	// Iterate over each field of the struct
	for i := 0; i < structVal.NumField(); i++ {
		fieldVal := structVal.Field(i)
		fieldType := structType.Field(i)

		// Skip unexported fields
		if !fieldVal.CanSet() {
			continue
		}

		tag, ok := fieldType.Tag.Lookup("config")
		if !ok {
			continue // Skip fields without the config tag
		}

		if fieldType.Type.Kind() == reflect.Struct {
			err := ParseStruct(fieldVal.Addr().Interface(), envPrefix)
			if err != nil {
				return err
			}
			continue
		}

		tags := parseTag(tag)

		defaultValue, err := loadDefault(tags)
		if err != nil {
			return fmt.Errorf("unable to load default val for: %s: %w", fieldVal, err)
		}

		// Determine the effective default value
		// environment variable overrides default
		if envVal, ok := loadEnv(tags, envPrefix); ok {
			defaultValue = envVal
		}

		if err = setFlag(fieldVal, fieldType.Name, tags, defaultValue); err != nil {
			return err
		}
	}
	return nil
}

func setFlag(fieldVal reflect.Value, fieldName string, tags map[string]string, defaultValue string) error {
	flagName, ok := tags["flag"]
	if !ok {
		return fmt.Errorf("field: %s, does not have a `flag` tag", fieldName)
	}
	usage := tags["usage"]

	// Set the flag based on the field's type
	fieldPtr := fieldVal.Addr().Interface()
	switch fieldVal.Kind() {
	case reflect.String:
		flag.StringVar(fieldPtr.(*string), flagName, defaultValue, usage)
	case reflect.Int:
		defaultInt, err := strconv.Atoi(defaultValue)
		if err != nil {
			return fmt.Errorf("invalid integer default for %s: %w", fieldName, err)
		}
		flag.IntVar(fieldPtr.(*int), flagName, defaultInt, usage)
	case reflect.Bool:
		defaultBool, err := strconv.ParseBool(defaultValue)
		if err != nil {
			return fmt.Errorf("invalid boolean default for %s: %w", fieldName, err)
		}
		flag.BoolVar(fieldPtr.(*bool), flagName, defaultBool, usage)
	default:
		return fmt.Errorf("unsupported field type for configuration: %s", fieldVal.Kind())
	}

	return nil
}

func loadEnv(tags map[string]string, envPrefix string) (string, bool) {
	env, ok := tags["env"]
	if !ok {
		return "", false
	}
	envName := fmt.Sprintf("%s_%s", envPrefix, env)

	return os.LookupEnv(envName)
}

func loadDefault(tags map[string]string) (string, error) {
	defaultValue, ok := tags["default"]
	if !ok {
		return "", fmt.Errorf("empty default value, set 'default' tag")
	}
	return defaultValue, nil
}

// parseTag splits a struct tag into a key-value map.
// e.g., `flag=port,env=PORT` becomes `map[string]string{"flag": "port", "env": "PORT"}`
func parseTag(tag string) map[string]string {
	result := make(map[string]string)
	parts := strings.Split(tag, ",")
	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			result[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}
	return result
}
