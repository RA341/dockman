#!/usr/bin/env python3
"""Reachability-aware retention for the Dockman GHCR package.

GitHub exposes OCI indexes, manifests, attestations and signatures as package
versions. Deleting every untagged version can therefore corrupt a tagged
multi-architecture image. This tool keeps the requested integration history,
walks every OCI descriptor reachable from protected tags, and only deletes
versions outside that graph.
"""

import argparse
import base64
import concurrent.futures
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


MANIFEST_ACCEPT = ", ".join(
    (
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.oci.artifact.manifest.v1+json",
    )
)
ARCHES = ("amd64", "arm64")
SHA_TAG_RE = re.compile(r"^sha256-([0-9a-f]{64})$")
SEMVER_RE = re.compile(r"^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$")


def request_json(url, token, owner, method="GET", registry_bearer=None):
    request = urllib.request.Request(
        url,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + token,
            "User-Agent": "dockman-ghcr-retention",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    if url.startswith("https://ghcr.io/"):
        request.add_header("Accept", MANIFEST_ACCEPT)
        request.add_header("Authorization", "Bearer " + registry_bearer)
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None


def get_registry_token(owner, package, token):
    query = urllib.parse.urlencode(
        {
            "service": "ghcr.io",
            "scope": "repository:{}/{}:pull".format(owner.lower(), package.lower()),
        }
    )
    request = urllib.request.Request(
        "https://ghcr.io/token?" + query,
        headers={
            "Accept": "application/json",
            "Authorization": "Basic "
            + base64.b64encode((owner + ":" + token).encode()).decode(),
            "User-Agent": "dockman-ghcr-retention",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read())
    registry_token = data.get("token") or data.get("access_token")
    if not registry_token:
        raise RuntimeError("GHCR token exchange returned no registry token")
    return registry_token


def list_versions(owner, package, token):
    versions = []
    page = 1
    while True:
        url = (
            "https://api.github.com/users/{}/packages/container/{}/versions"
            "?per_page=100&page={}"
        ).format(
            urllib.parse.quote(owner, safe=""),
            urllib.parse.quote(package, safe=""),
            page,
        )
        batch = request_json(url, token, owner)
        versions.extend(batch)
        if len(batch) < 100:
            return versions
        page += 1


def version_tags(version):
    return version.get("metadata", {}).get("container", {}).get("tags", [])


def is_release_tag(tag):
    base = re.sub(r"-(?:amd64|arm64)$", "", tag)
    return base in {"latest", "release", "canary", "main"} or bool(
        SEMVER_RE.fullmatch(base)
    )


def select_protected(versions, base_tag, keep_count):
    history_re = re.compile(
        r"^{}-([0-9a-f]{{12}})$".format(re.escape(base_tag))
    )
    history = []
    for version in versions:
        for tag in version_tags(version):
            if history_re.fullmatch(tag):
                history.append((version.get("created_at", ""), tag))

    retained_history = []
    for _, tag in sorted(history, reverse=True):
        if tag not in retained_history:
            retained_history.append(tag)
        if len(retained_history) == keep_count:
            break

    protected_tags = {base_tag}
    protected_tags.update(base_tag + "-" + arch for arch in ARCHES)
    for tag in retained_history:
        protected_tags.add(tag)
        protected_tags.update(tag + "-" + arch for arch in ARCHES)

    # Release tags are outside the integration retention domain and must never
    # be removed by this workflow.
    for version in versions:
        protected_tags.update(tag for tag in version_tags(version) if is_release_tag(tag))

    root_digests = {
        version["name"]
        for version in versions
        if protected_tags.intersection(version_tags(version))
    }
    signature_tags = {"sha256-" + digest.split(":", 1)[1] for digest in root_digests}
    protected_tags.update(signature_tags)
    root_digests.update(
        version["name"]
        for version in versions
        if protected_tags.intersection(version_tags(version))
    )
    return protected_tags, root_digests, retained_history


def fetch_manifest(owner, package, digest, token, registry_bearer):
    url = "https://ghcr.io/v2/{}/{}/manifests/{}".format(
        urllib.parse.quote(owner.lower(), safe=""),
        urllib.parse.quote(package.lower(), safe=""),
        urllib.parse.quote(digest, safe=":"),
    )
    try:
        return request_json(url, token, owner, registry_bearer=registry_bearer)
    except urllib.error.HTTPError as error:
        raise RuntimeError("cannot read protected OCI manifest {}: HTTP {}".format(
            digest, error.code
        )) from error


def reachable_digests(owner, package, roots, token, registry_bearer):
    reachable = set()
    pending = list(roots)
    while pending:
        digest = pending.pop()
        if digest in reachable:
            continue
        manifest = fetch_manifest(owner, package, digest, token, registry_bearer)
        reachable.add(digest)
        descriptors = list(manifest.get("manifests", []))
        subject = manifest.get("subject")
        if subject:
            descriptors.append(subject)
        for descriptor in descriptors:
            child = descriptor.get("digest", "")
            if child.startswith("sha256:") and child not in reachable:
                pending.append(child)
    return reachable


def build_plan(versions, protected_tags, reachable):
    delete = []
    keep = []
    for version in versions:
        tags = set(version_tags(version))
        protected = bool(tags.intersection(protected_tags))
        reachable_version = version["name"] in reachable
        if protected or reachable_version:
            keep.append(version)
        else:
            delete.append(version)
    return keep, delete


def delete_version(owner, package, version_id, token):
    url = "https://api.github.com/users/{}/packages/container/{}/versions/{}".format(
        urllib.parse.quote(owner, safe=""),
        urllib.parse.quote(package, safe=""),
        int(version_id),
    )
    request_json(url, token, owner, method="DELETE")


def format_version(version):
    tags = version_tags(version)
    return "{} {} {}".format(version["id"], version["name"], ",".join(tags) or "untagged")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--owner", required=True)
    parser.add_argument("--package", default="dockman")
    parser.add_argument("--tag", default="integration")
    parser.add_argument("--keep", type=int, default=3)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.keep < 1:
        raise SystemExit("--keep must be at least 1")
    if args.workers < 1 or args.workers > 16:
        raise SystemExit("--workers must be between 1 and 16")
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN or GITHUB_TOKEN is required")

    versions = list_versions(args.owner, args.package, token)
    protected_tags, roots, history = select_protected(
        versions, args.tag, args.keep
    )
    required = {args.tag, args.tag + "-amd64", args.tag + "-arm64"}
    existing_tags = {tag for version in versions for tag in version_tags(version)}
    missing = required.difference(existing_tags)
    if missing:
        raise SystemExit("refusing cleanup; required tags missing: " + ", ".join(sorted(missing)))

    registry_bearer = get_registry_token(args.owner, args.package, token)
    reachable = reachable_digests(
        args.owner, args.package, roots, token, registry_bearer
    )
    keep, delete = build_plan(versions, protected_tags, reachable)
    print("versions={} kept={} delete={} reachable={}".format(
        len(versions), len(keep), len(delete), len(reachable)
    ))
    print("retained history: " + (", ".join(history) or "none yet"))
    tagged_delete = [version for version in delete if version_tags(version)]
    untagged_delete = len(delete) - len(tagged_delete)
    print("stale tagged versions={}; unreachable untagged versions={}".format(
        len(tagged_delete), untagged_delete
    ))
    for version in tagged_delete:
        print(("would delete " if args.dry_run else "deleting ") + format_version(version))

    if not args.dry_run:
        failures = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    delete_version,
                    args.owner,
                    args.package,
                    version["id"],
                    token,
                ): version
                for version in delete
            }
            completed = 0
            for future in concurrent.futures.as_completed(futures):
                version = futures[future]
                try:
                    future.result()
                except Exception as error:  # report every failed explicit version
                    failures.append((version, error))
                completed += 1
                if completed % 100 == 0 or completed == len(delete):
                    print("deleted {}/{} package versions".format(completed, len(delete)))
        if failures:
            for version, error in failures:
                print("failed {}: {}".format(format_version(version), error), file=sys.stderr)
            raise SystemExit("{} package version deletions failed".format(len(failures)))

        remaining = list_versions(args.owner, args.package, token)
        remaining_tags = {tag for version in remaining for tag in version_tags(version)}
        if not required.issubset(remaining_tags):
            raise SystemExit("post-cleanup verification lost a required integration tag")
        stale_sha_tags = {
            tag
            for version in remaining
            for tag in version_tags(version)
            if SHA_TAG_RE.fullmatch(tag) and tag not in protected_tags
        }
        if stale_sha_tags:
            raise SystemExit("stale sha256 tags remain: " + ", ".join(sorted(stale_sha_tags)))
        stale_tags = {
            tag
            for version in remaining
            for tag in version_tags(version)
            if tag not in protected_tags
        }
        if stale_tags:
            raise SystemExit("stale tags remain: " + ", ".join(sorted(stale_tags)))
        print("post-cleanup verification passed: {} versions remain".format(len(remaining)))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, urllib.error.URLError) as error:
        print("GHCR retention failed: {}".format(error), file=sys.stderr)
        raise SystemExit(1)
