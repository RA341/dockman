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

RUN apk update && apk add --no-cache gcc musl-dev git

COPY core/go.mod core/go.sum ./

RUN go mod download

COPY .git .git
COPY core/ .

ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH
ARG INFO_PACKAGE=github.com/RA341/dockman/internal/info

RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags "-s -w \
             -X ${INFO_PACKAGE}.Flavour=Docker \
             -X ${INFO_PACKAGE}.Version=$(git describe --exact-match --tags HEAD 2>/dev/null || echo "dev") \
             -X ${INFO_PACKAGE}.CommitInfo=$(git rev-parse HEAD) \
             -X ${INFO_PACKAGE}.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
             -X ${INFO_PACKAGE}.Branch=$(git rev-parse --abbrev-ref HEAD)" \
    -o dockman "./cmd/server"

FROM alpine:latest AS compose_cli_downloader

WORKDIR /download

RUN apk --no-cache add curl ca-certificates

ARG COMPOSE_VERSION=v5.0.1

# $(uname -m) to automatically detect x86_64 or aarch64 (ARM)
RUN curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)"  \
    -o ./docker-compose && \
    chmod +x ./docker-compose

FROM alpine:latest AS alpine

RUN apk add --no-cache tzdata su-exec

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

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

# set default envs so that entrypoint can handle the permissions
ENV DOCKMAN_UI_PATH=./dist
ENV DOCKMAN_COMPOSE_ROOT=/compose
ENV DOCKMAN_CONFIG=/config

ENTRYPOINT ["entrypoint.sh"]

CMD ["./dockman"]
