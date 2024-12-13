FROM node:21
WORKDIR /app

COPY . /app
RUN npm ci
CMD node index.js
