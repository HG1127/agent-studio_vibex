# V8 disposable staging API only. Node 24 is required for built-in TS stripping.
# For a future production release, pin a vetted base image digest.
FROM node:24-alpine
WORKDIR /app
RUN npm install --global pnpm@11.23.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY src ./src
USER node
EXPOSE 7402
CMD ["node","--experimental-strip-types","src/server.ts"]
