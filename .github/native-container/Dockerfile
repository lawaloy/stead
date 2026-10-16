ARG BASE_IMAGE
FROM ${BASE_IMAGE}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
COPY .github/ci.env /opt/stead-toolchain.env
RUN source /opt/stead-toolchain.env && \
    rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* && \
    printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/%s/ bookworm-security main\n' \
      "$ANDROID_CONTAINER_DEBIAN_SNAPSHOT" "$ANDROID_CONTAINER_DEBIAN_SNAPSHOT" > /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
      unzip ca-certificates curl libpulse0 libx11-6 libxext6 libxrender1 \
      libxi6 libxtst6 libnss3 libxkbcommon0 libxcb1 libdrm2 libgbm1 \
      libasound2 libxkbfile1 fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/* && \
    curl --fail --location --retry 3 "$JAVA_LINUX_ARCHIVE_URL" -o /tmp/java.tar.gz && \
    echo "$JAVA_LINUX_ARCHIVE_SHA256  /tmp/java.tar.gz" | sha256sum --check --strict && \
    mkdir -p /opt/stead-java && tar -xzf /tmp/java.tar.gz -C /opt/stead-java --strip-components=1 && \
    rm /tmp/java.tar.gz && npm install --global "npm@$NPM_VERSION"
ENV JAVA_HOME=/opt/stead-java
ENV PATH="/opt/stead-java/bin:${PATH}"
ENV MAESTRO_CLI_NO_ANALYTICS=1
WORKDIR /stead
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/install-maestro.mjs scripts/android-sdk.mjs scripts/archive-utils.mjs scripts/toolchain.mjs scripts/process-utils.mjs scripts/
COPY .github/ci.env .github/android-sdk-lock.json .github/
RUN node scripts/install-maestro.mjs && node scripts/android-sdk.mjs --accept-licenses
COPY api/package.json api/package-lock.json api/prisma.config.ts api/
COPY api/prisma/ api/prisma/
RUN npm ci --prefix api
COPY mobile/package.json mobile/package-lock.json mobile/
RUN npm ci --prefix mobile
COPY . .
RUN --mount=type=cache,target=/root/.gradle,sharing=locked \
    if test -f .stead-app.apk; then \
      mkdir -p mobile/.ci/android && cp .stead-app.apk mobile/.ci/android/stead-debug.apk; \
    else npm run native:build:android; fi
ENTRYPOINT ["node", "scripts/android-container-entry.mjs"]
