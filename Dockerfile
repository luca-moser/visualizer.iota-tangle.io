FROM ubuntu:18.04
MAINTAINER Luca Moser <moser.luca@gmail.com>

# install zeromq
RUN apt-get update && apt-get install -y wget libtool pkg-config build-essential autoconf automake uuid-dev
RUN cd /opt && wget https://github.com/zeromq/libzmq/releases/download/v4.2.2/zeromq-4.2.2.tar.gz \
&& tar xvzf zeromq-4.2.2.tar.gz \
&& cd zeromq-4.2.2 && ./configure \
&& make install && ldconfig

# create client directories
RUN mkdir -p /app/assets/css && mkdir -p /app/assets/html \
&& mkdir -p /app/assets/js && mkdir -p /app/assets/img

# create server directories
RUN mkdir -p /app/configs && mkdir -p /app/logs

# copy server assets
COPY server/cmd/visualizer                  /app/visualizer
COPY server/cmd/configs/app_prod.json       /app/configs/app.json
COPY server/cmd/configs/network_prod.json   /app/configs/network.json

# copy client assets
COPY client/css/*           /app/assets/css/
COPY client/img/*           /app/assets/img/
COPY client/js/index.html   /app/assets/html/index.html
COPY client/js/app.js       /app/assets/js/app.js
COPY client/js/vendor.js    /app/assets/js/vendor.js

# workdir and ports
WORKDIR /app
EXPOSE 9000

# entrypoint
ENTRYPOINT ["/app/visualizer"]