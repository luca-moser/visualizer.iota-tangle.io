FROM golang:latest

ENV ZMQ_VERSION 4.1.4

# Install needed packages
RUN apt-get update && apt-get install -y --fix-missing \
    curl \
    libtool \
    pkg-config \
    lxc \
    build-essential \
    autoconf \
    automake \
    && mkdir -p /tmp/zeromq \
    && curl -SL http://download.zeromq.org/zeromq-$ZMQ_VERSION.tar.gz | tar zxC /tmp/zeromq \
    && cd /tmp/zeromq/zeromq-$ZMQ_VERSION/ \
    && ./configure --without-libsodium \
    && make \
    && make install \
    && ldconfig \
    && rm -rf /tmp/zeromq \
    && apt-get purge -y \
    curl \
    libtool \
    build-essential \
    autoconf \
    automake \
    && apt-get clean && apt-get autoclean && apt-get -y autoremove

# Install Node.js
RUN apt-get update && apt-get install -y --fix-missing \
    curl \
    sudo \
    && curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash - \
    && sudo apt-get install -y nodejs

# Build server
COPY ./server /app/server
WORKDIR /app/server
RUN go build cmd/app.go

# Build client
COPY ./client /app/client
WORKDIR /app/client
RUN npm install
RUN npm run build:prod

EXPOSE 9000

WORKDIR /app/server/cmd
ENTRYPOINT [ "go", "run", "app.go" ]