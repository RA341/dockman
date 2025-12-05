FROM node:24-alpine AS front

WORKDIR /frontend

COPY ui/package.json ui/package-lock.json ./

RUN npm i

COPY ui .

RUN npm run build

FROM golang:1-alpine AS back

WORKDIR /core

# for sqlite
ENV CGO_ENABLED=1

RUN apk update && apk add --no-cache gcc musl-dev

COPY core/go.mod core/go.sum ./

RUN go mod download

COPY core/ .

# These ARGs are automatically populated by Docker Buildx for each platform.
# e.g., for 'linux/arm64', TARGETOS becomes 'linux' and TARGETARCH becomes 'arm64'.
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

ARG VERSION=dev
ARG COMMIT_INFO=unknown
ARG BRANCH=unknown
ARG INFO_PACKAGE=github.com/RA341/dockman/internal/info

# We run the build on the native amd64 runner, but use GOOS and GOARCH
# to tell the Go compiler to create a binary for the *target* platform.
# This avoids slow emulation for the compilation step.
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags "-s -w \
             -X ${INFO_PACKAGE}.Flavour=Docker \
             -X ${INFO_PACKAGE}.Version=${VERSION} \
             -X ${INFO_PACKAGE}.CommitInfo=${COMMIT_INFO} \
             -X ${INFO_PACKAGE}.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
             -X ${INFO_PACKAGE}.Branch=${BRANCH}" \
    -o dockman "./cmd/server"

FROM alpine:latest AS alpine

RUN apk add --no-cache tzdata

# identify dockman containers
LABEL dockman.container=true

WORKDIR /app

COPY --from=back /core/dockman dockman

COPY --from=front /frontend/dist/ ./dist

# todo non root
#RUN chown -R appuser:appgroup /app
#
#USER appuser

EXPOSE 8866

ENTRYPOINT ["./dockman"]
