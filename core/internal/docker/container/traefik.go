package container

import (
	"regexp"
	"slices"
	"strings"
)

var (
	traefikHostFunction = regexp.MustCompile(`(?i)\bHost(?:SNI(?:Regexp)?|Regexp)?\s*\(([^)]*)\)`)
	traefikQuotedValue  = regexp.MustCompile("[`\\\"']([^`\\\"']+)[`\\\"']")
)

// TraefikHosts returns the distinct host endpoints declared on enabled
// HTTP, TCP or UDP routers. Docker label order is undefined, so the result is
// sorted to keep monitor rows stable between refreshes.
func TraefikHosts(labels map[string]string) []string {
	enabled := true
	for key, value := range labels {
		if strings.EqualFold(key, "traefik.enable") {
			enabled = strings.EqualFold(strings.TrimSpace(value), "true")
			break
		}
	}
	if !enabled {
		return nil
	}

	hosts := make(map[string]struct{})
	for key, rule := range labels {
		key = strings.ToLower(key)
		if !strings.HasPrefix(key, "traefik.http.routers.") &&
			!strings.HasPrefix(key, "traefik.tcp.routers.") &&
			!strings.HasPrefix(key, "traefik.udp.routers.") {
			continue
		}
		if !strings.HasSuffix(key, ".rule") {
			continue
		}
		for _, call := range traefikHostFunction.FindAllStringSubmatch(rule, -1) {
			for _, quoted := range traefikQuotedValue.FindAllStringSubmatch(call[1], -1) {
				host := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(quoted[1]), "."))
				if host != "" && host != "*" {
					hosts[host] = struct{}{}
				}
			}
		}
	}

	result := make([]string, 0, len(hosts))
	for host := range hosts {
		result = append(result, host)
	}
	if len(result) == 0 {
		return nil
	}
	slices.Sort(result)
	return result
}
