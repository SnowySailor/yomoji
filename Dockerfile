FROM node:21 as base
WORKDIR /app

EXPOSE 3000

ENV PORT 3000

COPY package.json package-lock.json ./

RUN npm install --frozen-lockfile \
    && chown -R 1000:1000 /app

COPY . .

USER 1000

FROM base as prod

RUN npm run build
CMD ["npm", "run", "start"]

FROM base as dev

CMD ["npm", "run", "dev"]
