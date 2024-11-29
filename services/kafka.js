import {
    Kafka
} from "kafkajs";
import ip from "ip"
import "dotenv/config"
import { handleMessage } from "../messageHandler.js";

const HOST_IP = process.env.HOST_IP || ip.address()
const mode = process.env.MODE || "DEV"

const kafka = new Kafka({
    clientId: "veritas.ai",
    brokers: [(mode === "PROD")? "kafka:9092": `${HOST_IP}:9092`]
})

const producer = kafka.producer()
const consumer = kafka.consumer({
    groupId: "veritas-consumer-group-0"
})

const topics = ["reverse_engineer_prompt", "generate_perturbation", "generate_search_query",  "google_search", "crawl_website", "fine_tune_llm"]

async function sendMessage(message) {
    const {
        topic,
        data
    } = message
    const metadata = await producer.send({
        topic,
        messages: [{
            value: JSON.stringify(data)
        }]
    })

    return metadata
}

const initKafka = async () => {
    await producer.connect()

    await consumer.connect()
    await consumer.subscribe({
        topics
    })

    await consumer.run({
        eachMessage: async ({
            topic,
            partition,
            message
        }) => {
            const data = JSON.parse(message.value.toString())
            console.log({
                topic,
                partition,
                offset: message.offset,
                value: data
            })

            handleMessage(topic, data)
        }
    })
}

export {
    sendMessage,
    initKafka
}