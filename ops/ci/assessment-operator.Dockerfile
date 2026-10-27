# Synthetic CI only. The runtime container has no network, ports or host mounts.
FROM node:24.14.1-bookworm-slim AS node24
FROM pgvector/pgvector:0.8.7-pg18
COPY --from=node24 /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates passwd \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 20001 assessmentci \
    && useradd --uid 20001 --gid 20001 --no-create-home --home-dir /tmp/assessment-ci --shell /usr/sbin/nologin assessmentci \
    && mkdir -p /opt/assessment-ci /tmp/assessment-ci \
    && chown 20001:20001 /tmp/assessment-ci
WORKDIR /opt/assessment-ci
COPY payload/services/pg-api/src/ services/pg-api/src/
COPY payload/services/pg-api/tests/ services/pg-api/tests/
COPY payload/services/pg-api/node_modules/ services/pg-api/node_modules/
COPY payload/services/pg-api/package.json services/pg-api/package.json
COPY payload/services/pg-api/pnpm-lock.yaml services/pg-api/pnpm-lock.yaml
COPY payload/shared/ shared/
COPY payload/db/postgres/ db/postgres/
COPY payload/SHA256SUMS SHA256SUMS
RUN sha256sum -c SHA256SUMS >/dev/null \
    && chmod -R go-w /opt/assessment-ci \
    && node --version
# Keep the upstream postgres entrypoint. Only the CI coordinator supplies its
# fixed port5333/listen127 arguments, synthetic password and tmpfs PGDATA.
