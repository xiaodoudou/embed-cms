# The image of the example: embed-cms and the app, and no secret. A secret given to the build (ARG, ENV, a copied file) stays in the
# layers of the image for whoever can pull it, so the build is given none: they come when the container starts, from .env.
#
# Built by scripts/build.sh.

# --- the modules: the only stage that needs the network and a compiler's worth of tools -----------------------------------
FROM node:22-bookworm-slim AS modules
WORKDIR /app
# the lock file first: this layer is only made again when the dependencies change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- the image that runs -------------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=modules --chown=root:root /app/node_modules ./node_modules
# the files are named one by one, so that nothing else of the folder (a .env) can end up in the image
COPY package.json server.js cms.json content.json ./
COPY resources ./resources
# the one folder the program writes to, owned by the user it runs as (a volume mounted on it starts with the same owner)
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
# not root: the official image has the user `node`
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# no shell around node: SIGTERM from `docker stop` reaches it, and it closes the databases
CMD ["node", "server.js"]
