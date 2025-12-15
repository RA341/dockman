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

ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

ARG VERSION=dev
ARG COMMIT_INFO=unknown
ARG BRANCH=unknown
ARG INFO_PACKAGE=github.com/RA341/dockman/internal/info

RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags "-s -w \
             -X ${INFO_PACKAGE}.Flavour=Docker \
             -X ${INFO_PACKAGE}.Version=${VERSION} \
             -X ${INFO_PACKAGE}.CommitInfo=${COMMIT_INFO} \
             -X ${INFO_PACKAGE}.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
             -X ${INFO_PACKAGE}.Branch=${BRANCH}" \
    -o dockman "./cmd/server"

FROM alpine:latest AS compose_cli_downloader

WORKDIR /download

RUN apk --no-cache add curl ca-certificates

ARG COMPOSE_VERSION=v5.0.0

# $(uname -m) to automatically detect x86_64 or aarch64 (ARM)
RUN curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)"  \
    -o ./docker-compose && \
    chmod +x ./docker-compose

FROM alpine:latest AS alpine

RUN apk add --no-cache tzdata

COPY --from=compose_cli_downloader /download/docker-compose /usr/local/bin/docker-compose

# identify dockman containers
LABEL dockman.container=true

WORKDIR /app

COPY --from=back /core/dockman dockman

COPY --from=front /frontend/dist/ ./dist

# todo non root
#RUN chown -R appuser:appgroup /app
#
#USER appuser

RUN docker-compose version

EXPOSE 8866

ENTRYPOINT ["./dockman"]
