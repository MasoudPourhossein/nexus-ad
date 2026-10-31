FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip ca-certificates curl \
  && ARCH=$(dpkg --print-architecture | sed 's/amd64/64/;s/arm64/arm64-v8a/') \
  && curl -fsSL -o /tmp/x.zip "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${ARCH}.zip" \
  && unzip -o /tmp/x.zip xray -d /usr/local/bin && chmod +x /usr/local/bin/xray && rm /tmp/x.zip \
  && apt-get purge -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm install -g tsx@4.23.15
ENV NEXUS_XRAY_BIN=/usr/local/bin/xray
EXPOSE 3100
CMD ["tsx", "src/index.ts"]
