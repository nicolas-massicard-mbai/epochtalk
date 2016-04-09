FROM debian:jessie
MAINTAINER boka <boka@slickage.com>

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# update/upgrade and install basic deps
RUN apt-get -y update \
  && apt-get -y upgrade \
  && apt-get -y install \
    build-essential \
    curl \
    git \
    libpq-dev \
    python \
    redis-server \
    ruby \
  && gem install foreman

ENV NVM_DIR /root/.nvm
ENV NODE_VERSION 5.4.1

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash \
  && source $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && nvm alias default $NODE_VERSION \
  && nvm use default

ENV NODE_PATH $NVM_DIR/versions/node/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# install bower
RUN npm install -g bower

# install bower dependencies
COPY bower.json .
RUN bower install --allow-root

# install npm dependencies
COPY package.json .
RUN npm install

# run the server
ADD . .
ENTRYPOINT service redis-server start \
  && npm run db-migrate \
  && node cli --seed \
  && npm run serve

EXPOSE 8080
