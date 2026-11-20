# Build context: repository root.
FROM node:20-bookworm-slim AS base
ARG TERRAFORM_VERSION=1.9.8
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git curl unzip \
  && ARCH=$(dpkg --print-architecture) \
  && curl -fsSL -o /tmp/tf.zip "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${ARCH}.zip" \
  && unzip /tmp/tf.zip -d /usr/local/bin && rm /tmp/tf.zip \
  && apt-get purge -y curl unzip && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/runner/package.json apps/runner/
RUN pnpm install --frozen-lockfile --filter @terraplan/runner...
COPY packages/shared packages/shared
COPY apps/runner apps/runner
RUN pnpm --filter @terraplan/runner... build

FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/runner
EXPOSE 4100
CMD ["node", "dist/main.js"]
