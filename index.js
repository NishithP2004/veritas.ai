import express from "express"
import { createServer } from "node:http";
import { Server } from "socket.io" 
import { sendMessage, initKafka } from "./kafka.js";

initKafka().catch(console.error)

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}))

const server = createServer(app)
const io = new Server(server);

io.on("connection", (client) => {
    console.log(client.id)

    client.on("message", async (message, callback) => {
        const metadata = await sendMessage(message)
        callback({ metadata })
    })
})

server.listen(PORT, () => {
    console.log(`Listening on Port: ${PORT}`)
})