FROM node:24-alpine AS front

WORKDIR /frontend

COPY ui/package.json ui/package-lock.json ./

RUN npm i

COPY ui .

RUN npm run build

FROM golang:1.24-alpine AS back

WORKDIR /core

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

# We run the build on the native amd64 runner, but use GOOS and GOARCH
# to tell the Go compiler to create a binary for the *target* platform.
# This avoids slow emulation for the compilation step.
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags "-s -w \
             -X github.com/RA341/dockman/internal/info.Flavour=Docker \
             -X github.com/RA341/dockman/internal/info.Version=${VERSION} \
             -X github.com/RA341/dockman/internal/info.CommitInfo=${COMMIT_INFO} \
             -X github.com/RA341/dockman/internal/info.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
             -X github.com/RA341/dockman/internal/info.Branch=${BRANCH}" \
    -o dockman "./cmd/server/main.go"

# Alpine target
FROM alpine:latest AS alpine

# incase app needs to make https requests
#RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=back /core/dockman dockman

COPY --from=front /frontend/dist/ ./dist

# todo non root
#RUN chown -R appuser:appgroup /app
#
#USER appuser

EXPOSE 8866

ENTRYPOINT ["./dockman"]

# Alpine with ssh client target
FROM alpine:latest AS alpine-ssh

RUN apk add --no-cache ca-certificates openssh-client

WORKDIR /app

COPY --from=back /core/dockman dockman

COPY --from=front /frontend/dist/ ./dist

# todo non root
#RUN chown -R appuser:appgroup /app
#
#USER appuser

EXPOSE 8866

ENTRYPOINT ["./dockman"]


# Scratch target
FROM scratch AS minimal

# todo user perms and certs to make https requests
#COPY --from=back /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
#
#COPY --from=back /etc/passwd /etc/passwd
#
#COPY --from=back /etc/group /etc/group

WORKDIR /app

COPY --from=back /core/dockman dockman

COPY --from=front /frontend/dist/ ./dist

EXPOSE 8866

ENTRYPOINT ["./dockman"]
