# Builds server, shell and all module frontends into one image.
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps apps
COPY libs libs
COPY modules modules
COPY tools tools
COPY nx.json tsconfig.base.json tsconfig.json jest.preset.js jest.config.ts ./
RUN npm ci --no-audit --no-fund
ENV NX_DAEMON=false NX_NO_CLOUD=true
RUN npx nx run-many -t build -p shell masterdata-web incidents-web training-web respiratory-protection-web compensation-web equipment-web cost-recovery-web promotions-web clothing-web duty-officer-web info-terminal-web mp-feuer-web backup-web privacy-web \
 && npx nx run @forga/server:prune
RUN mkdir -p /web/modules \
 && cp -r apps/shell/dist /web/shell \
 && for m in modules/*/*-web; do cp -r "$m/dist" "/web/modules/$(basename "$m" -web)"; done

FROM node:24-alpine
# pg_dump, pg_restore and psql in the version of the database server (module backup).
RUN apk add --no-cache postgresql17-client
WORKDIR /app
# Real data unless the container says otherwise (FORGA_STAGE=test for the test system).
ENV NODE_ENV=production FORGA_WEB_DIR=/app/web PORT=3000 FORGA_STAGE=production
COPY --from=build /repo/apps/server/dist ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /web ./web
RUN mkdir -p /plugins /backups && chown node:node /plugins /backups
USER node
EXPOSE 3000
CMD ["node", "main.js"]
