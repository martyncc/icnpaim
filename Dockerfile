# Use Node 18, not this cryptid from the fossil record
FROM node:18

# Create app directory
WORKDIR /usr/app

# Install app dependencies
COPY package.json package-lock.json ./

# Avoid npm ci tantrum due to weird deps
RUN npm install --legacy-peer-deps

# Copy the rest of the code
COPY . .

# Build server and frontend
RUN npm run build-server && npm run build-public

# App runs on port 3000 (or whatever you want)
EXPOSE 3000

# Start your glorious mess
CMD ["bash", "./launch.sh"]
