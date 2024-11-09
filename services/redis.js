import {
    createClient
} from "redis";
import "dotenv/config"

const client = createClient({
    /* username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD, */
    socket: {
        host: "127.0.0.1",
        port: 6379
    }
});

client.connect()
    .then(() => console.log("Connected to Redis successfully."))
    .catch(err => console.error)

export {
    client
}