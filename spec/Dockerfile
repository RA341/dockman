FROM ubuntu:latest

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential tools and dependencies
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
ENV GOPATH=/go
ENV PATH=$PATH:$GOPATH/bin

# Install NVM and Node.js
ENV NVM_DIR=/root/.nvm
ENV NODE_VERSION=22.12.0

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . $NVM_DIR/nvm.sh && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use default

# Add node and npm to path so the commands are available
ENV NODE_PATH=$NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH
# Install Node.js dependencies globally
# @bufbuild/buf depends on
# @bufbuild/protobuf
RUN . $NVM_DIR/nvm.sh && \
    npm install -g \
    @bufbuild/protoc-gen-es

# Install Go tools
RUN go install github.com/bufbuild/buf/cmd/buf@latest && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest

# Set up PATH for tools
ENV PATH="/root/.pub-cache/bin:${PATH}"

# Create working directory
WORKDIR /workspace

# Default command
CMD ["./gen-stubs.sh"]
