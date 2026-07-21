# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.0
ARG GO_VERSION=1.26.5
ARG ALPINE_VERSION=3.24.1
ARG COMPOSE_VERSION=v5.3.1
ARG COMPOSE_X_CRYPTO_VERSION=v0.54.0
ARG COMPOSE_X_TEXT_VERSION=v0.40.0
ARG NODE_IMAGE_DIGEST=sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
ARG GO_IMAGE_DIGEST=sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2
ARG ALPINE_IMAGE_DIGEST=sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

FROM node:${NODE_VERSION}-alpine3.24@${NODE_IMAGE_DIGEST} AS front

WORKDIR /frontend

# Electron is a desktop-only development dependency. The container build only
# compiles the web frontend, so avoid downloading an unused platform binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY ui/package.json ui/package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY ui/ ./

# Browser diagnostics are compiled out by default. A dedicated diagnostic
# image can opt in with --build-arg VITE_DEBUG=true.
ARG VITE_DEBUG=false
RUN VITE_DEBUG="${VITE_DEBUG}" npm run build

FROM golang:${GO_VERSION}-alpine3.24@${GO_IMAGE_DIGEST} AS back

WORKDIR /build

RUN apk add --no-cache gcc musl-dev

COPY core/go.mod core/go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY core/ ./

ARG VERSION=development
ARG COMMIT_INFO=unknown
ARG BUILD_DATE=1970-01-01T00:00:00Z
ARG BRANCH=unknown

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && \
    CGO_ENABLED=1 go build \
      -trimpath \
      -buildvcs=false \
      -ldflags "-s -w \
        -X github.com/RA341/dockman/internal/info.Version=${VERSION} \
        -X github.com/RA341/dockman/internal/info.CommitInfo=${COMMIT_INFO} \
        -X github.com/RA341/dockman/internal/info.BuildDate=${BUILD_DATE} \
        -X github.com/RA341/dockman/internal/info.Branch=${BRANCH}" \
      -o /out/dockman \
      ./cmd/docker && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -buildvcs=false -ldflags "-s -w" \
      -o /out/dockman-file-helper-amd64 ./cmd/filehelper && \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -buildvcs=false -ldflags "-s -w" \
      -o /out/dockman-file-helper-arm64 ./cmd/filehelper

FROM golang:${GO_VERSION}-alpine3.24@${GO_IMAGE_DIGEST} AS compose_cli_builder

ARG COMPOSE_VERSION
ARG COMPOSE_X_CRYPTO_VERSION
ARG COMPOSE_X_TEXT_VERSION

# Rebuild the upstream Compose release with the patched Go toolchain and
# explicit compatible security updates. Modules are authenticated by sum.golang.org.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download "github.com/docker/compose/v5@${COMPOSE_VERSION}" && \
    cp -R "/go/pkg/mod/github.com/docker/compose/v5@${COMPOSE_VERSION}" /compose-source && \
    chmod -R u+w /compose-source && \
    cd /compose-source && \
    go mod edit \
      -require="golang.org/x/crypto@${COMPOSE_X_CRYPTO_VERSION}" \
      -require="golang.org/x/text@${COMPOSE_X_TEXT_VERSION}" && \
    go mod tidy && \
    CGO_ENABLED=0 go build \
      -trimpath \
      -ldflags "-s -w -X github.com/docker/compose/v5/internal.Version=${COMPOSE_VERSION}" \
      -o /out/docker-compose \
      ./cmd && \
    /out/docker-compose version

FROM alpine:${ALPINE_VERSION}@${ALPINE_IMAGE_DIGEST} AS runtime

# docker-cli powers the run-a-docker-command feature on the local host
# (remote hosts run it over ssh); it also works through DOCKER_HOST/socketproxy.
RUN apk add --no-cache tzdata su-exec docker-cli

COPY pkg/docker/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY --from=compose_cli_builder /out/docker-compose /usr/local/bin/docker-compose

# identify dockman containers
LABEL dockman.container=true

ARG VERSION=development
ARG COMMIT_INFO=unknown
ARG BUILD_DATE=1970-01-01T00:00:00Z
ARG BRANCH=unknown
ARG NODE_VERSION
ARG GO_VERSION
ARG ALPINE_VERSION
ARG COMPOSE_VERSION
ARG COMPOSE_X_CRYPTO_VERSION
ARG COMPOSE_X_TEXT_VERSION
ARG NODE_IMAGE_DIGEST
ARG GO_IMAGE_DIGEST
ARG ALPINE_IMAGE_DIGEST

LABEL org.opencontainers.image.title="Dockman" \
      org.opencontainers.image.description="Docker management UI built from the Dockman integration fork" \
      org.opencontainers.image.source="https://github.com/cerede2000/dockman" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_INFO}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      dev.dockman.build.branch="${BRANCH}" \
      dev.dockman.build.node="${NODE_VERSION}" \
      dev.dockman.build.go="${GO_VERSION}" \
      dev.dockman.build.alpine="${ALPINE_VERSION}" \
      dev.dockman.build.compose="${COMPOSE_VERSION}" \
      dev.dockman.build.compose-x-crypto="${COMPOSE_X_CRYPTO_VERSION}" \
      dev.dockman.build.compose-x-text="${COMPOSE_X_TEXT_VERSION}" \
      dev.dockman.build.node-digest="${NODE_IMAGE_DIGEST}" \
      dev.dockman.build.go-digest="${GO_IMAGE_DIGEST}" \
      dev.dockman.build.alpine-digest="${ALPINE_IMAGE_DIGEST}"

WORKDIR /app

COPY --from=back /out/dockman dockman
COPY --from=back /out/dockman-file-helper-* /usr/local/libexec/

COPY --from=front /frontend/dist/ ./dist

RUN docker-compose version && docker --version

EXPOSE 8866

# set default envs so that entrypoint can handle the permissions
ENV DOCKMAN_UI_PATH=./dist
ENV DOCKMAN_COMPOSE_ROOT=/compose
ENV DOCKMAN_CONFIG=/config
ENV DOCKMAN_YAML_PATH=/config/dockyaml

ENTRYPOINT ["entrypoint.sh"]

CMD ["./dockman"]
