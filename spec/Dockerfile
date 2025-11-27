FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install --no-install-recommends -y \
    curl \
    git \
    wget \
    unzip \
    protobuf-compiler \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Go
ENV GO_VERSION=1.25.3

RUN curl -OL https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go$GO_VERSION.linux-amd64.tar.gz && \
    rm go$GO_VERSION.linux-amd64.tar.gz
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/home/ubuntu/go
ENV PATH=$PATH:$GOPATH/bin

# Install NVM and Node.js
ENV NVM_DIR=/home/ubuntu/.nvm
ENV NODE_VERSION=22.12.0

RUN mkdir -p $NVM_DIR && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    chown -R ubuntu:ubuntu $NVM_DIR

USER ubuntu

RUN . $NVM_DIR/nvm.sh && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use default

ENV NODE_PATH=$NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN . $NVM_DIR/nvm.sh && \
    npm install -g @bufbuild/protoc-gen-es

RUN go install github.com/bufbuild/buf/cmd/buf@latest && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest

ENV PATH="/home/ubuntu/.pub-cache/bin:${PATH}"

USER root
RUN mkdir -p /workspace && chown -R ubuntu:ubuntu /workspace
USER ubuntu

WORKDIR /workspace

CMD ["./gen-stubs.sh"]
