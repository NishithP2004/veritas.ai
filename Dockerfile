FROM node:latest
WORKDIR /app
COPY package*.json .
RUN npm i
COPY . .
ENV PORT=3000
ENV OLLAMA_NUM_PARALLEL=4
EXPOSE 3000
# RUN curl -fsSL https://ollama.com/install.sh | sh
# CMD sh -c 'ollama serve >/dev/null 2>&1 & sleep 10 && ollama pull gemma2:2b >/dev/null 2>&1 & node index.js'
CMD ["node", "index.js"]