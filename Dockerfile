FROM node:24-alpine AS front

WORKDIR /frontend

COPY ui/package.json ui/package-lock.json ./

RUN npm i

COPY ui .

RUN npm run build

FROM golang:1-alpine AS back

WORKDIR /build

# for sqlite
ENV CGO_ENABLED=1

RUN apk update && apk add --no-cache gcc musl-dev git curl

RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin

RUN task --help

COPY core/go.mod core/go.sum core/

RUN cd core && go mod download

COPY .git .git
COPY core/ core/
COPY Taskfile.yml .

RUN task go:b:docker OUT_EXE=../dockman PROD=1

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

COPY --from=back /build/dockman dockman

COPY --from=front /frontend/dist/ ./dist

RUN docker-compose version

EXPOSE 8866

# set default envs so that entrypoint can handle the permissions
ENV DOCKMAN_UI_PATH=./dist
ENV DOCKMAN_COMPOSE_ROOT=/compose
ENV DOCKMAN_CONFIG=/config
ENV DOCKMAN_YAML_PATH=/config/dockyaml

ENTRYPOINT ["entrypoint.sh"]

CMD ["./dockman"]
