FROM public.ecr.aws/docker/library/node:16

# Create app directory
RUN mkdir -p /usr/app
WORKDIR /usr/app

# Install app dependencies
COPY package.json package-lock.json /usr/app/
RUN npm ci --ignore-scripts

# Bundle app source
COPY . /usr/app
RUN npm run build-server && npm run build-public

EXPOSE 8000
CMD ./launch.sh