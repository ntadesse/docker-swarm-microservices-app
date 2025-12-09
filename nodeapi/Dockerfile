FROM node:14-alpine AS nodeapi-build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production

FROM node:14-alpine
WORKDIR /usr/src/app/
COPY --from=nodeapi-build /usr/src/app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
# Test3
