#!/bin/bash

# Download zeromq
# Ref http://zeromq.org/intro:get-the-software
cd /opt
wget https://github.com/zeromq/libzmq/releases/download/v4.2.2/zeromq-4.2.2.tar.gz

# Unpack tarball package
tar xvzf zeromq-4.2.2.tar.gz

# Install dependency
apt-get update && \
apt-get install -y libtool pkg-config build-essential autoconf automake uuid-dev

# Create make file
cd zeromq-4.2.2
./configure

# Build and install(root permission only)
make install

# Install zeromq driver on linux
ldconfig

# Check installed
ldconfig -p | grep zmq

# Expected
############################################################
# libzmq.so.5 (libc6,x86-64) => /usr/local/lib/libzmq.so.5
# libzmq.so (libc6,x86-64) => /usr/local/lib/libzmq.so
############################################################

# go back to server directory
echo "going back into visualizer directory"
cd /go/src/github.com/luca-moser/visualizer.iota-tangle.io/server/cmd
echo "building visualizer binary"
CGO_ENABLED=1 go build -ldflags="-s -w" -v -o visualizer

echo "going back to root directory"
cd ./../..
pwd
echo "adjusting file permissions"
chmod 770 server/cmd/visualizer
chmod 770 client/js/app.js
chmod 770 client/js/vendor.js