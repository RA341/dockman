package info

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/rs/zerolog/log"
)

// VersionCheckResult represents the result of a version check
type VersionCheckResult struct {
	CurrentVersion      *VersionHistory
	IsNewVersion        bool
	ShouldShowChangelog bool
}

type Service struct {
	db VersionHistoryManager
}

func NewService(infoDB VersionHistoryManager) *Service {
	s := &Service{
		db: infoDB,
	}

	err := infoDB.CleanupOldVersions(10)
	if err != nil {
		log.Warn().Err(err).Msg("Unable to remove old versions from version history")
	}

	result, err := s.CheckVersionStatus(Version)
	if err != nil {
		log.Fatal().Err(err).Msg("version check failed")
	}

	if result != nil && result.CurrentVersion != nil {
		log.Info().Str("prev", result.CurrentVersion.Version).Str("current", Version).Msg("checking version")
	}

	log.Debug().Msg("Info service loaded successfully")
	return s
}

func (cm *Service) VerifyVersion(currentAppVersion string) (*VersionCheckResult, string, string, error) {
	result, err := cm.CheckVersionStatus(currentAppVersion)
	if err != nil {
		return nil, "", "", fmt.Errorf("version check failed: %w", err)
	}

	if result.ShouldShowChangelog {
		// Show changelog to user
		changelog, releaseUrl, err := GetChangelogData(currentAppVersion)
		if err != nil {
			return result, "", "", fmt.Errorf("failed to get changelog: %w", err)
		}

		return result, changelog, releaseUrl, nil
	}

	return result, "", "", nil
}

// CheckVersionStatus checks the current version status and determines if changelog should be shown
func (cm *Service) CheckVersionStatus(currentAppVersion string) (*VersionCheckResult, error) {
	ok := isValidSemver(currentAppVersion)
	if !ok {
		log.WithLevel(-1).
			Str("version", currentAppVersion).
			Msg("invalid semver, changelog will not be checked")

		return &VersionCheckResult{
			CurrentVersion: &VersionHistory{
				Version: currentAppVersion,
				Read:    true,
			},
			IsNewVersion:        false,
			ShouldShowChangelog: false,
		}, nil
	}

	lastVersion, err := cm.db.FindLastVersion()
	if err != nil {
		return nil, fmt.Errorf("failed to find last version: %w", err)
	}

	result := &VersionCheckResult{}

	// Case 1: No previous version exists (first run)
	if lastVersion == nil {
		// Create version entry for current version
		err = cm.db.CreateVersionEntry(currentAppVersion)
		if err != nil {
			return nil, fmt.Errorf("failed to create version entry: %w", err)
		}

		result.IsNewVersion = true
		result.ShouldShowChangelog = true
		return result, nil
	}

	result.CurrentVersion = lastVersion

	// Case 2: Version has changed (app was updated)
	if lastVersion.Version != currentAppVersion {
		err = cm.db.CreateVersionEntry(currentAppVersion)
		if err != nil {
			return nil, fmt.Errorf("failed to create version entry: %w", err)
		}

		result.IsNewVersion = true
		result.ShouldShowChangelog = true
		return result, nil
	}

	// Case 3: Same version, check if user has read the changelog
	result.IsNewVersion = false
	result.ShouldShowChangelog = !lastVersion.Read

	return result, nil
}

func isValidSemver(version string) bool {
	// Full SemVer regex (with optional v, pre-release, build metadata)
	semverRegex := `^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)` +
		`(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?` +
		`(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$`

	re := regexp.MustCompile(semverRegex)

	if re.MatchString(version) {
		return true
	}

	return false
}

// MarkChangelogAsRead marks the specified version as read
func (cm *Service) MarkChangelogAsRead(version string) error {
	return cm.db.MarkVersionAsRead(version)
}

// GetChangelogData retrieves changelog information for display
func GetChangelogData(version string) (string, string, error) {
	releaseUrl := fmt.Sprintf("%s/releases/tag/%s", repo, version)

	changelog, err := GetGitHubChangelog(repo, version)
	if err != nil {
		return "", "", fmt.Errorf("failed to get changelog from repo: %w", err)
	}

	return changelog, releaseUrl, nil
}

// GetGitHubChangelog fetches the changelog (release body) for a specific version of a GitHub repo
func GetGitHubChangelog(repoURL, version string) (string, error) {
	// Extract owner and repo name from URL
	parts := strings.Split(strings.TrimPrefix(repoURL, "https://github.com/"), "/")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid GitHub repo URL: %s", repoURL)
	}
	owner, repoName := parts[0], parts[1]

	// Build GitHub API URL for the release
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/tags/%s", owner, repoName, version)

	// Create HTTP request
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "changelog-fetcher") // GitHub requires a User-Agent

	// Perform the request
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer fileutil.Close(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	// Parse JSON response
	var result struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Body, nil
}
